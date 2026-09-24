import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 通用 JSON 存储服务（内存缓存 + 数据库持久化）
 * --------------------------------------------------------------------------
 * 后台所有可动态维护的数据（素材、分类、配置、统计）通过本服务统一读写。
 *
 * 设计要点：
 *  - **同步 API**：`read`/`write` 均为同步签名，供业务 service 启动时直接调用；
 *    实际数据源始终命中「内存缓存」，保证跨端调用不因异步数据库产生时序问题。
 *  - **启动加载**：应用启动（onModuleInit）时按顺序从 Supabase(app_store 表)读取
 *    全部 KV 写入内存，覆盖本地种子数据。这样 FaaS 重启后配置/素材不丢失。
 *  - **写入落库**：`write` 同步更新内存缓存，并排入队列异步 upsert 到数据库；
 *    进程关闭（onApplicationShutdown）前 flush 队列，避免数据丢失。
 *  - **本地兜底**：数据库不可用（未开通 Supabase 或读取出错）时退化为本地文件
 *    读写（兼容本地开发）。本地文件仍作为种子/兜底来源。
 *
 * 数据库表：app_store (key text primary key, value jsonb, updated_at)
 */
@Injectable()
export class FileStore implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('FileStore');
  /** 随包部署、可读取初始数据的目录（可能只读） */
  private readonly seedDir: string;
  /** 本地可写目录（FaaS 只读时回退 os.tmpdir，仅作为本地开发/兜底） */
  private readonly dataDir: string;
  /** 内存缓存：filename -> 文档内容（业务读写一律命中这里） */
  private readonly cache = new Map<string, unknown>();
  /** 数据库是否可用 */
  private dbEnabled = false;
  /** 异步落库的串行队列（保证顺序 & 便于关闭前 flush） */
  private dbQueue: Promise<void> = Promise.resolve();
  private shuttingDown = false;

  constructor() {
    this.seedDir = this.resolveSeedDir();
    this.dataDir = this.resolveWritableDir();
    this.dbEnabled = !!(process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY);
    this.logger.log(
      `种子数据目录: ${this.seedDir} | 可写数据目录: ${this.dataDir} | 数据库持久化: ${this.dbEnabled ? '启用' : '未启用(退化为本地文件)'}`,
    );
  }

  get isDbEnabled(): boolean {
    return this.dbEnabled;
  }

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

  private resolveWritableDir(): string {
    if (this.isWritable(this.seedDir)) return this.seedDir;
    for (const dir of this.seedCandidates()) {
      if (this.isWritable(dir)) return dir;
    }
    const tmp = path.join(os.tmpdir(), 'coze-server', 'data');
    fs.mkdirSync(tmp, { recursive: true });
    this.logger.warn(`种子目录只读，本地兜底目录: ${tmp}（数据库不可用时重启数据将丢失）`);
    return tmp;
  }

  get dir(): string {
    return this.dataDir;
  }

  // ---------------------------------------------------------------------------
  // 启动加载：从数据库拉取全部 KV 到内存缓存（覆盖本地种子）
  // ---------------------------------------------------------------------------
  async onModuleInit() {
    if (!this.dbEnabled) return;
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.from('app_store').select('key, value');
      if (error) throw new Error(error.message);
      const rows = (data || []) as { key: string; value: any }[];
      for (const row of rows) {
        this.cache.set(row.key, row.value);
      }
      this.logger.log(`已从数据库加载 ${rows.length} 个存储键，覆盖内存缓存`);

      // 将本地存在的、但数据库缺失的种子文件补写到数据库（首次迁移）
      await this.seedMissingKeysToDb();
    } catch (err) {
      // 数据库不可用 → 退化为本地文件读写
      this.dbEnabled = false;
      this.logger.warn(`数据库加载失败，退化为本地文件读写: ${(err as Error).message}`);
    }
  }

  /** 把本地种子目录中已有、但数据库中没有的 key 写入数据库（首次迁移/兜底） */
  private async seedMissingKeysToDb() {
    const existingKeys = new Set(this.cache.keys());
    const local = ['config.json', 'materials.json', 'users.json', 'stats.json']
      .filter((f) => !existingKeys.has(f))
      .map((f) => {
        const value = this.readLocalFile(f);
        return value === undefined ? null : { key: f, value };
      })
      .filter((x): x is { key: string; value: any } => x !== null);

    for (const item of local) {
      await this.persistToDb(item.key, item.value, true);
      this.cache.set(item.key, item.value);
    }
    if (local.length) this.logger.log(`已将 ${local.length} 个本地种子键首次写入数据库`);
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

  /** 读取 JSON：优先内存缓存（启动时已由 DB 覆盖），缺失则回落本地文件，再返回 fallback */
  read<T>(filename: string, fallback: T): T {
    if (this.cache.has(filename)) return this.cache.get(filename) as T;
    const local = this.readLocalFile(filename);
    if (local !== undefined) {
      this.cache.set(filename, local);
      return local as T;
    }
    return fallback;
  }

  /** 写入：同步更新内存缓存 + 异步落库（DB 启用时） + 本地兜底写盘 */
  write(filename: string, data: unknown) {
    this.cache.set(filename, data);
    // 本地兜底写盘（尽量写，失败忽略 — FaaS 只读等场景）
    try {
      this.ensureDir();
      fs.writeFileSync(path.join(this.dataDir, filename), JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      /* 忽略：本地写失败不影响 DB 持久化 */
    }
    if (this.dbEnabled && !this.shuttingDown) {
      this.enqueueDbWrite(filename, data);
    }
  }

  private enqueueDbWrite(key: string, value: unknown) {
    this.dbQueue = this.dbQueue
      .then(() => this.persistToDb(key, value, false))
      .catch((err) => this.logger.warn(`数据库写入失败(${key}): ${(err as Error).message}`));
  }

  /** 实际 upsert 单条到 app_store */
  private async persistToDb(key: string, value: unknown, onConflictSafe: boolean): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await client
      .from('app_store')
      .upsert({ key, value }, { onConflict: onConflictSafe ? 'key' : 'key' });
    if (error) throw new Error(error.message);
  }

  private ensureDir() {
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  // ---------------------------------------------------------------------------
  // 关闭前 flush 未落库的写队列，尽量保证数据不丢
  // ---------------------------------------------------------------------------
  async onApplicationShutdown() {
    this.shuttingDown = true;
    if (!this.dbEnabled) return;
    try {
      await this.dbQueue;
      this.logger.log('数据库写入队列已 flush');
    } catch (err) {
      this.logger.warn(`关闭前 flush 失败: ${(err as Error).message}`);
    }
  }

  /** 同步暴露当前内存缓存中某 key 是否存在（供测试/调试） */
  has(filename: string): boolean {
    return this.cache.has(filename);
  }
}