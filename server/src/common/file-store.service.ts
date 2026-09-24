import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * 通用 JSON 文件读写服务
 * --------------------------------------------------------------------------
 * 后台所有可动态维护的数据（素材、分类、配置、统计）都持久化到
 * `server/data/*.json`，通过本服务统一读写，无需外部数据库 / TOS。
 *
 * 数据目录解析顺序（多候选 + 可写回退）：
 *   1. 环境变量 `DATA_DIR`（部署环境可显式指定，推荐持久化卷）
 *   2. `process.cwd()/data`（本地开发即 server/data）
 *   3. 系统临时目录 `<os.tmpdir()>/coze-server/data`
 *
 * 前两个候选若创建/写入失败（例如 FaaS 只读文件系统），自动回退到可写的临时目录，
 * 保证任何环境都能正常启动与服务。
 */
@Injectable()
export class FileStore {
  private readonly logger = new Logger('FileStore');
  /** 实际生效的数据文件根目录 */
  private dataDir: string;

  constructor() {
    this.dataDir = this.resolveDataDir();
    this.ensureDir();
    this.logger.log(`数据目录: ${this.dataDir}`);
  }

  /** 解析一个可用（可创建、可写）的数据目录 */
  private resolveDataDir(): string {
    const candidates: { label: string; dir: string }[] = [];

    if (process.env.DATA_DIR) {
      candidates.push({ label: 'DATA_DIR', dir: process.env.DATA_DIR });
    }
    candidates.push({
      label: 'cwd/data',
      dir: path.resolve(process.cwd(), 'data'),
    });
    candidates.push({
      label: 'os.tmpdir',
      dir: path.join(os.tmpdir(), 'coze-server', 'data'),
    });

    for (const c of candidates) {
      try {
        fs.mkdirSync(c.dir, { recursive: true });
        // 验证可写
        const probe = path.join(c.dir, '.write-probe');
        fs.writeFileSync(probe, new Date().toISOString(), 'utf-8');
        fs.rmSync(probe, { force: true });
        return path.resolve(c.dir);
      } catch (err) {
        this.logger.warn(`候选数据目录不可用 (${c.label}) ${c.dir}: ${(err as Error).message}`);
      }
    }
    // 理论上不会走到：至少 os.tmpdir 可写
    return path.join(os.tmpdir(), 'coze-server', 'data');
  }

  get dir(): string {
    return this.dataDir;
  }

  private ensureDir() {
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  /** 读取 JSON 文件；文件不存在或解析失败时返回 fallback */
  read<T>(filename: string, fallback: T): T {
    this.ensureDir();
    const full = path.join(this.dataDir, filename);
    if (!fs.existsSync(full)) {
      return fallback;
    }
    try {
      return JSON.parse(fs.readFileSync(full, 'utf-8')) as T;
    } catch (err) {
      console.error('[FileStore] 读取失败:', filename, err);
      return fallback;
    }
  }

  /** 写入 JSON 文件（格式化、原子落盘到磁盘） */
  write(filename: string, data: unknown) {
    this.ensureDir();
    const full = path.join(this.dataDir, filename);
    fs.writeFileSync(full, JSON.stringify(data, null, 2), 'utf-8');
  }
}