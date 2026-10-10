import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 通用 JSON 存储服务（内存缓存 + 数据库持久化）
 * --------------------------------------------------------------------------
 * 后台所有可动态维护的数据（素材、分类、配置、统计）通过本服务统一读写。
 *
 * 设计要点：
 *  - **同步 API**：`read`/`write` 均为同步签名，业务 service 直接调用即可；
 *    实际数据源始终命中「内存缓存」，保证跨端调用不因异步数据库产生时序问题。
 *  - **启动加载**：应用启动时从 Supabase(app_store 表) 读取全部 KV 写入内存缓存，
 *    覆盖本地种子数据。加载失败会**带退避自动重试**，恢复后自动补写本地改动，
 *    不允许「一次抖动就整段实例生命周期不再落库」。
 *  - **写入落库**：`write` 更新内存缓存并排入队列异步 upsert；写失败**不丢数据**，
 *    留在队列里按退避重试，直到成功（进程关闭前会做最后一次 flush）。
 *  - **防覆盖**：整份文档 upsert 在多实例下会被「旧快照」整体覆盖。对声明了
 *    `merge` 策略的键（materials.json），写入前比对数据库里的版本号，若已被别的
 *    实例改过，则以远端为基底合并后再写，避免整批素材被旧数据顶掉。
 *  - **本地兜底**：数据库不可用时退化为本地文件读写（兼容本地开发）。
 *    ⚠️ 数据库可用时**不再写本地文件**，避免把线上密钥/数据写进镜像目录。
 *
 * 数据库表：app_store (key text primary key, value jsonb, updated_at timestamptz)
 */

/** 写入选项 */
export interface StoreWriteOptions<T> {
  /**
   * 冲突合并策略：当数据库里的文档已被「别的实例」改过时，以远端为基底把本次改动叠上去。
   * 只对「多写者、丢一条就疼」的大文档（materials.json）需要；不传则按「本地覆盖远端」处理。
   */
  merge?: (remote: T, local: T) => T;
}

/** 持久化诊断信息（供 /api/health 与后台排查用，不含任何密钥） */
export interface StoreDiagnostics {
  instanceId: string;
  /** 是否配置了数据库环境变量 */
  dbEnabled: boolean;
  /** 数据库当前状态：connecting=启动中 / ok=在用 / degraded=降级为本地文件 */
  dbState: 'connecting' | 'ok' | 'degraded';
  /** 已从数据库读到的键数量 */
  dbKeyCount: number;
  /** 尚未成功落库的键 */
  pendingKeys: string[];
  writes: number;
  dbWritesOk: number;
  dbWritesFailed: number;
  lastDbLoadAt?: string;
  lastDbWriteAt?: string;
  lastError?: string;
  seedDir: string;
  dataDir: string;
  localFileMode: boolean;
}

/** 启动加载重试退避（毫秒） */
const LOAD_RETRY_MS = [400, 1000, 2500, 5000, 10000];
/** 写入重试退避（毫秒），用尽后维持最后一档持续重试 */
const WRITE_RETRY_MS = [500, 1500, 4000, 10000, 20000, 30000];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface DirtyEntry {
  value: unknown;
  merge?: (remote: any, local: any) => any;
}

@Injectable()
export class FileStore implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('FileStore');
  /** 随包部署的种子目录（可能只读） */
  private readonly seedDir: string;
  /** 本地兜底可写目录（仅在数据库不可用时使用） */
  private readonly dataDir: string;
  /** 实例标识：日志里区分是哪个实例在写，方便排查多实例覆盖 */
  private readonly instanceId = randomUUID().slice(0, 8);

  /** 内存缓存：filename -> 文档内容（业务读写一律命中这里） */
  private readonly cache = new Map<string, unknown>();
  /** 待落库队列：只有确认写入成功才会被清除 */
  private readonly dirty = new Map<string, DirtyEntry>();
  /** 记录我们从数据库读到（或自己写入）的版本号 updated_at，用于冲突检测 */
  private readonly rev = new Map<string, string>();

  private dbEnabled = false;
  private dbState: 'connecting' | 'ok' | 'degraded' = 'connecting';
  private dbQueue: Promise<void> = Promise.resolve();
  private flushTimer?: ReturnType<typeof setTimeout>;
  private writeAttempt = 0;
  private shuttingDown = false;

  private readonly stat = {
    writes: 0,
    dbWritesOk: 0,
    dbWritesFailed: 0,
    lastDbLoadAt: undefined as string | undefined,
    lastDbWriteAt: undefined as string | undefined,
    lastError: undefined as string | undefined,
  };

  constructor() {
    this.seedDir = this.resolveSeedDir();
    this.dataDir = this.resolveWritableDir();
    this.dbEnabled = !!(process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY);
    this.dbState = this.dbEnabled ? 'connecting' : 'degraded';

    if (this.dbEnabled) {
      this.logger.log(
        `[${this.instanceId}] 数据库持久化: 已配置 | 种子目录: ${this.seedDir} | 可写目录: ${this.dataDir}`,
      );
    } else {
      // 这种情况会导致「跑几小时后数据回到初始状态」，必须显式报错而不是悄悄降级
      this.logger.error(
        `[${this.instanceId}] ⚠️ 未检测到数据库环境变量(COZE_SUPABASE_URL / COZE_SUPABASE_ANON_KEY)：` +
          `数据只会写本地文件(${this.dataDir})，实例回收或重新部署后必然回退到初始数据。`,
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* 目录解析                                                            */
  /* ------------------------------------------------------------------ */

  /** 种子目录候选（含已存在 config.json / materials.json 的目录优先） */
  private seedCandidates(): string[] {
    const list: string[] = [];
    if (process.env.DATA_DIR) list.push(path.resolve(process.env.DATA_DIR));
    list.push(path.resolve(process.cwd(), 'data'));
    // 部署时 cwd = server/dist，向上一级的 server/data 才是随包数据
    list.push(path.resolve(process.cwd(), '..', 'data'));
    return [...new Set(list.map((d) => path.resolve(d)))];
  }

  private hasSeedData(dir: string): boolean {
    return ['config.json', 'materials.json'].some((f) => fs.existsSync(path.join(dir, f)));
  }

  private resolveSeedDir(): string {
    const candidates = this.seedCandidates();
    const withData = candidates.find((d) => this.hasSeedData(d));
    return withData || candidates[0];
  }

  private isWritable(dir: string): boolean {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, '.write-probe');
      fs.writeFileSync(probe, new Date().toISOString(), 'utf-8');
      fs.rmSync(probe, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 目录是否位于「部署工作区」内。
   * 平台把工程放在临时目录（如 /tmp/workdir）构建运行，那里的 data/ 属于镜像内容：
   * 写进去既会被下次部署覆盖，也可能把开发机的数据/密钥带进线上，一律不作为持久目录。
   */
  private isDeployWorkspace(dir: string): boolean {
    const ws = process.env.COZE_WORKSPACE_PATH;
    if (!ws) return false;
    const tmpRoot = path.resolve(os.tmpdir());
    const resolved = path.resolve(dir);
    return resolved === tmpRoot || resolved.startsWith(tmpRoot + path.sep);
  }

  private resolveWritableDir(): string {
    const explicit = process.env.DATA_DIR;
    if (explicit && this.isWritable(explicit)) return path.resolve(explicit);
    if (!this.isDeployWorkspace(this.seedDir) && this.isWritable(this.seedDir)) return this.seedDir;
    const tmp = path.join(os.tmpdir(), 'coze-server', 'data');
    try {
      fs.mkdirSync(tmp, { recursive: true });
    } catch {
      /* 忽略：目录已存在或不可创建，后续写盘会自行兜底 */
    }
    return tmp;
  }

  /* ------------------------------------------------------------------ */
  /* 对外状态                                                            */
  /* ------------------------------------------------------------------ */

  get isDbEnabled(): boolean {
    return this.dbEnabled;
  }

  get dir(): string {
    return this.dataDir;
  }

  /** 本地文件模式：数据库不可用时才会读写本地文件 */
  private get localFileMode(): boolean {
    return !this.dbEnabled || this.dbState !== 'ok';
  }

  diagnostics(): StoreDiagnostics {
    return {
      instanceId: this.instanceId,
      dbEnabled: this.dbEnabled,
      dbState: this.dbState,
      dbKeyCount: this.rev.size,
      pendingKeys: [...this.dirty.keys()],
      writes: this.stat.writes,
      dbWritesOk: this.stat.dbWritesOk,
      dbWritesFailed: this.stat.dbWritesFailed,
      lastDbLoadAt: this.stat.lastDbLoadAt,
      lastDbWriteAt: this.stat.lastDbWriteAt,
      lastError: this.stat.lastError,
      seedDir: this.seedDir,
      dataDir: this.dataDir,
      localFileMode: this.localFileMode,
    };
  }

  /* ------------------------------------------------------------------ */
  /* 启动加载                                                            */
  /* ------------------------------------------------------------------ */

  async onModuleInit(): Promise<void> {
    if (!this.dbEnabled) return;
    const ok = await this.loadWithRetry(LOAD_RETRY_MS.length);
    if (!ok) {
      this.logger.error(
        `[${this.instanceId}] 数据库加载失败，暂时降级为本地文件；` +
          `写入会进入重试队列，恢复后自动补写（数据不会静默丢失）`,
      );
      this.scheduleFlush(LOAD_RETRY_MS[0]);
    }
  }

  /** 带退避的加载重试；全部失败返回 false（进入 degraded，由定时器继续尝试） */
  private async loadWithRetry(maxAttempts: number): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.loadFromDb();
        return true;
      } catch (err) {
        this.stat.lastError = (err as Error).message;
        if (i < maxAttempts - 1) {
          const delay = LOAD_RETRY_MS[Math.min(i, LOAD_RETRY_MS.length - 1)];
          this.logger.warn(
            `[${this.instanceId}] 数据库加载第 ${i + 1} 次失败(${(err as Error).message})，${delay}ms 后重试`,
          );
          await sleep(delay);
        }
      }
    }
    this.dbState = 'degraded';
    return false;
  }

  /** 从数据库拉取全部 KV 覆盖内存缓存（脏键除外，避免把刚写的改动覆盖掉） */
  private async loadFromDb(): Promise<void> {
    const client = getSupabaseClient();
    const { data, error } = await client.from('app_store').select('key, value, updated_at');
    if (error) throw new Error(error.message);

    const rows = (data || []) as Array<{ key: string; value: unknown; updated_at?: string }>;
    for (const row of rows) {
      if (!this.dirty.has(row.key)) this.cache.set(row.key, row.value);
      if (row.updated_at) this.rev.set(row.key, String(row.updated_at));
    }
    this.dbState = 'ok';
    this.stat.lastDbLoadAt = new Date().toISOString();
    this.logger.log(
      `[${this.instanceId}] 已从数据库加载 ${rows.length} 个存储键，覆盖内存缓存`,
    );
    if (rows.length === 0) {
      this.logger.warn(
        `[${this.instanceId}] 数据库里没有任何数据。若这不是首次部署，请确认是否被清空、` +
          `或数据库环境变量是否指向了另一套环境`,
      );
    }
    if (this.allowSeedWriteToDb()) {
      await this.seedMissingKeysToDb(rows.map((r) => r.key));
    }
  }

  /** 重新从数据库拉取（后台「立即同步」用） */
  async reloadFromDb(): Promise<void> {
    if (!this.dbEnabled) return;
    await this.flush();
    await this.loadFromDb();
  }

  /**
   * 是否允许把「随包部署的本地文件」写进数据库。
   * 线上默认禁止：那些文件可能是开发机上的数据（含真实素材与密钥），
   * 反向回写既污染线上库也有泄密风险。需要时用 SEED_TO_DB=1 显式打开。
   */
  private allowSeedWriteToDb(): boolean {
    const flag = process.env.SEED_TO_DB;
    if (flag === '1') return true;
    if (flag === '0') return false;
    return !this.isDeployWorkspace(this.seedDir);
  }

  /** 把本地种子目录中已有、但数据库中没有的 key 写入数据库（仅本地开发/显式开启） */
  private async seedMissingKeysToDb(existingKeys: string[]): Promise<void> {
    const keys = new Set(existingKeys);
    const local = ['config.json', 'materials.json', 'users.json', 'stats.json']
      .filter((f) => !keys.has(f))
      .map((f) => {
        const value = this.readLocalFile(f);
        return value === undefined ? null : { key: f, value };
      })
      .filter((x): x is { key: string; value: unknown } => x !== null);

    for (const item of local) {
      try {
        await this.persistToDb(item.key, item.value);
        this.cache.set(item.key, item.value);
      } catch (err) {
        this.logger.warn(`种子写入数据库失败(${item.key}): ${(err as Error).message}`);
      }
    }
    if (local.length) {
      this.logger.log(
        `[${this.instanceId}] 已将 ${local.length} 个本地种子键首次写入数据库`,
      );
    }
  }

  /** 在本地候选目录读文件解析 JSON；不存在/解析失败返回 undefined */
  private readLocalFile(filename: string): unknown | undefined {
    const readable = [this.dataDir, this.seedDir]
      .map((d) => path.resolve(d))
      .filter((d, i, arr) => arr.indexOf(d) === i);
    for (const dir of readable) {
      const full = path.join(dir, filename);
      if (!fs.existsSync(full)) continue;
      try {
        return JSON.parse(fs.readFileSync(full, 'utf-8'));
      } catch (err) {
        console.error('[FileStore] 读取失败:', full, err);
      }
    }
    return undefined;
  }

  /* ------------------------------------------------------------------ */
  /* 读写                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * 读取 JSON：优先内存缓存（启动时已由 DB 覆盖），本地文件模式下回落文件，再返回 fallback。
   * ⚠️ fallback 也会被纳入内存缓存：业务层会在读到的对象上原地修改（如 users 里新增一条点赞），
   * 若每次都返回新的兜底对象，那些修改会落到临时对象上、写回时变成空文档 —— 数据会凭空消失。
   */
  read<T>(filename: string, fallback: T): T {
    const hit = this.cache.get(filename);
    if (hit !== undefined) return hit as T;
    if (this.localFileMode) {
      const local = this.readLocalFile(filename);
      if (local !== undefined) {
        this.cache.set(filename, local);
        return local as T;
      }
    }
    this.cache.set(filename, fallback);
    return fallback;
  }

  /** 写入：同步更新内存缓存 + 排入落库队列；数据库不可用时才写本地文件 */
  write<T>(filename: string, data: T, opts?: StoreWriteOptions<T>) {
    this.cache.set(filename, data);
    this.dirty.set(filename, { value: data, merge: opts?.merge as DirtyEntry['merge'] });
    this.stat.writes++;

    if (this.localFileMode) this.writeLocalFile(filename, data);

    if (!this.dbEnabled || this.shuttingDown) return;
    this.scheduleFlush(0);
  }

  private writeLocalFile(filename: string, data: unknown) {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(path.join(this.dataDir, filename), JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      /* 忽略：本地写失败不影响数据库持久化 */
    }
  }

  /* ------------------------------------------------------------------ */
  /* 落库队列                                                            */
  /* ------------------------------------------------------------------ */

  private scheduleFlush(delay: number) {
    if (this.flushTimer || !this.dbEnabled) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, delay);
    const t = this.flushTimer as unknown as { unref?: () => void };
    if (typeof t.unref === 'function') t.unref();
  }

  /** 串行 flush：全部成功才停；失败按退避重试，绝不静默丢数据 */
  flush(): Promise<void> {
    this.dbQueue = this.dbQueue
      .then(() => this.flushOnce())
      .catch((err) => {
        this.stat.lastError = (err as Error).message;
      });
    return this.dbQueue;
  }

  /** 立即落库（后台「立即同步」用），返回是否已全部写入成功 */
  async flushNow(): Promise<boolean> {
    if (!this.dbEnabled) return false;
    await this.flush();
    return this.dirty.size === 0;
  }

  private async flushOnce(): Promise<void> {
    if (!this.dbEnabled) return;

    // 降级状态先尝试恢复连接；恢复后脏数据才会被写下去
    if (this.dbState !== 'ok') {
      const ok = await this.loadWithRetry(1);
      if (!ok) {
        this.scheduleFlush(WRITE_RETRY_MS[this.writeAttempt]);
        return;
      }
    }

    let rounds = 0;
    while (this.dirty.size && rounds++ < 20) {
      const entries = [...this.dirty.entries()];
      let failed = false;
      for (const [key, entry] of entries) {
        try {
          await this.persistToDb(key, entry.value, entry.merge);
          // 期间没有新值写进来才清除，否则留下一轮补写
          if (this.dirty.get(key) === entry) this.dirty.delete(key);
          this.stat.dbWritesOk++;
          this.stat.lastDbWriteAt = new Date().toISOString();
          this.stat.lastError = undefined;
        } catch (err) {
          failed = true;
          this.stat.dbWritesFailed++;
          this.stat.lastError = `${key}: ${(err as Error).message}`;
        }
      }
      if (failed) {
        this.writeAttempt = Math.min(this.writeAttempt + 1, WRITE_RETRY_MS.length - 1);
        const delay = WRITE_RETRY_MS[this.writeAttempt];
        this.logger.error(
          `[${this.instanceId}] 数据库写入失败，${delay}ms 后重试（未落库键: ${[...this.dirty.keys()].join(', ')}）` +
            ` — ${this.stat.lastError}`,
        );
        this.scheduleFlush(delay);
        return;
      }
    }

    this.writeAttempt = 0;
    if (this.dirty.size) {
      // 写入过程中不断有新值进来，稍后再补一轮，避免空转
      this.scheduleFlush(200);
    }
  }

  /** 实际 upsert 单条到 app_store；带 merge 时先做冲突检测，避免整份覆盖别的实例的数据 */
  private async persistToDb<T>(
    key: string,
    value: T,
    merge?: (remote: T, local: T) => T,
  ): Promise<void> {
    const client = getSupabaseClient();
    let payload: unknown = value;

    if (merge) {
      const known = this.rev.get(key);
      if (known) {
        const { data: rows, error: readErr } = await client
          .from('app_store')
          .select('value, updated_at')
          .eq('key', key)
          .limit(1);
        if (readErr) throw new Error(`冲突检测读取失败: ${readErr.message}`);
        const row = (rows as Array<{ value: unknown; updated_at?: string }> | null)?.[0];
        const remoteRev = row?.updated_at ? String(row.updated_at) : '';
        if (row && remoteRev && remoteRev !== known) {
          payload = merge(row.value as T, value);
          // 内存缓存也同步为合并结果，避免本实例继续拿旧快照去覆盖
          this.cache.set(key, payload);
          this.logger.warn(
            `[${this.instanceId}] 检测到 ${key} 已被其他实例更新（远端 ${remoteRev} ≠ 本地 ${known}），` +
              `已按合并策略写入，避免整份覆盖丢数据`,
          );
        }
      }
    }

    const updatedAt = new Date().toISOString();
    const { data, error } = await client
      .from('app_store')
      .upsert({ key, value: payload, updated_at: updatedAt }, { onConflict: 'key' })
      .select('updated_at');
    if (error) throw new Error(error.message);

    // 用数据库回传的规范格式版本号（timestamptz 字符串）作为下一次冲突检测的基准
    const row = Array.isArray(data) ? data[0] : data;
    const canonical = row ? (row as { updated_at?: string }).updated_at : undefined;
    this.rev.set(key, canonical ? String(canonical) : updatedAt);
  }

  /* ------------------------------------------------------------------ */
  /* 关闭前 flush                                                        */
  /* ------------------------------------------------------------------ */

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (!this.dbEnabled) return;
    try {
      await this.flush();
      if (this.dirty.size) {
        this.logger.error(
          `[${this.instanceId}] 进程关闭前仍有 ${this.dirty.size} 个键未落库: ${[...this.dirty.keys()].join(', ')} — ` +
            this.stat.lastError,
        );
      } else {
        this.logger.log(`[${this.instanceId}] 关闭前所有数据已确认落库`);
      }
    } catch (err) {
      this.logger.warn(`关闭前 flush 失败: ${(err as Error).message}`);
    }
  }

  /** 同步暴露当前内存缓存中某 key 是否存在（供测试/调试） */
  has(filename: string): boolean {
    return this.cache.has(filename);
  }
}
