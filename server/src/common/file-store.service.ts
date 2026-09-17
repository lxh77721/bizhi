import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 通用 JSON 文件读写服务
 * --------------------------------------------------------------------------
 * 后台所有可动态维护的数据（素材、分类、配置、统计）都持久化到
 * `server/data/*.json`，通过本服务统一读写，无需外部数据库 / TOS。
 * 数据文件首次不存在时使用调用方传入的 fallback（种子数据）初始化。
 */
@Injectable()
export class FileStore {
  /** 数据文件根目录：server/data（后端进程 cwd 为 server 目录） */
  private readonly dataDir = path.resolve(process.cwd(), 'data');

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