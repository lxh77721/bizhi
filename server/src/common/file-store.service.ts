import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * 通用 JSON 文件读写服务
 * --------------------------------------------------------------------------
 * 后台所有可动态维护的数据（素材、分类、配置、统计）都持久化到 JSON 文件，
 * 通过本服务统一读写。
 *
 * 关键背景：
 *  - 本地开发时进程 cwd = `server`，数据目录为 `server/data`。
 *  - 部署（veFaaS）时启动脚本会 `cd server/dist`，因此除 `cwd/data` 外，
 *    还需向上查找 `server/data`（dist 的同级目录），那里才是随包部署的配置。
 *  - FaaS 文件系统可能只读，写入失败时回退到系统临时可写目录。
 *
 * 目录解析分两步：
 *  1) 「只读种子目录」：用于读取随包部署的 config/materials 等初始数据
 *     （DATA_DIR → cwd/data → cwd/../data）。
 *  2) 「可写数据目录」：优先可写的种子目录，否则回退 os.tmpdir。
 * 读取时若可写目录没有某文件，会回落到种子目录取初始值。
 */
@Injectable()
export class FileStore {
  private readonly logger = new Logger('FileStore');
  /** 随包部署、可读取初始数据的目录（可能只读） */
  private readonly seedDir: string;
  /** 实际可写、读写优先使用的目录 */
  private readonly dataDir: string;

  constructor() {
    this.seedDir = this.resolveSeedDir();
    this.dataDir = this.resolveWritableDir();
    this.logger.log(`种子数据目录: ${this.seedDir} | 可写数据目录: ${this.dataDir}`);
  }

  /** 列出候选种子目录（含已存在 config.json / materials.json 的目录优先） */
  private seedCandidates(): string[] {
    const list: string[] = [];
    if (process.env.DATA_DIR) list.push(path.resolve(process.env.DATA_DIR));
    list.push(path.resolve(process.cwd(), 'data'));
    // 部署时 cwd = server/dist，向上一级的 server/data 才是随包数据
    list.push(path.resolve(process.cwd(), '..', 'data'));
    // 去重
    return [...new Set(list.map(d => path.resolve(d)))];
  }

  private hasSeedData(dir: string): boolean {
    return ['config.json', 'materials.json'].some(f => fs.existsSync(path.join(dir, f)));
  }

  private resolveSeedDir(): string {
    const candidates = this.seedCandidates();
    // 优先选择确实包含随包数据的目录
    const withData = candidates.find(d => this.hasSeedData(d));
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
    // 1) 种子目录本身可写（本地开发 / 可持久化卷）→ 直接用
    if (this.isWritable(this.seedDir)) return this.seedDir;
    // 2) 其它候选也试一遍
    for (const dir of this.seedCandidates()) {
      if (this.isWritable(dir)) return dir;
    }
    // 3) 回退系统临时可写目录
    const tmp = path.join(os.tmpdir(), 'coze-server', 'data');
    fs.mkdirSync(tmp, { recursive: true });
    this.logger.warn(`种子目录只读，运行期数据回退到临时目录: ${tmp}（重启后临时改动将丢失）`);
    return tmp;
  }

  get dir(): string {
    return this.dataDir;
  }

  private ensureDir() {
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  /** 读取 JSON 文件：优先可写目录，缺失时回落种子目录，再否则返回 fallback */
  read<T>(filename: string, fallback: T): T {
    const readable = [this.dataDir, this.seedDir]
      .map(d => path.resolve(d))
      .filter((d, i, arr) => arr.indexOf(d) === i);

    for (const dir of readable) {
      const full = path.join(dir, filename);
      if (!fs.existsSync(full)) continue;
      try {
        return JSON.parse(fs.readFileSync(full, 'utf-8')) as T;
      } catch (err) {
        console.error('[FileStore] 读取失败:', full, err);
      }
    }
    return fallback;
  }

  /** 写入 JSON 文件（格式化、落盘到可写目录） */
  write(filename: string, data: unknown) {
    this.ensureDir();
    const full = path.join(this.dataDir, filename);
    fs.writeFileSync(full, JSON.stringify(data, null, 2), 'utf-8');
  }
}