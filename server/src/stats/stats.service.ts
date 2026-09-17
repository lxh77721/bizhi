import { Injectable } from '@nestjs/common';
import { FileStore } from '@/common/file-store.service';

/** 首页展示的管理统计指标（持久化到 server/data/stats.json） */
export interface Stats {
  generateCount: number; // AI 生成累计次数
  unlockCount: number;   // 激励视频解锁下载累计次数
}

const DEFAULT_STATS: Stats = {
  generateCount: 0,
  unlockCount: 0,
};

@Injectable()
export class StatsService {
  private cache: Stats = DEFAULT_STATS;

  constructor(private readonly store: FileStore) {}

  onModuleInit() {
    this.cache = Object.assign({}, DEFAULT_STATS, this.store.read('stats.json', DEFAULT_STATS));
  }

  get(): Stats {
    return this.cache;
  }

  recordGenerate() {
    this.cache = { ...this.cache, generateCount: this.cache.generateCount + 1 };
    this.store.write('stats.json', this.cache);
  }

  recordUnlock() {
    this.cache = { ...this.cache, unlockCount: this.cache.unlockCount + 1 };
    this.store.write('stats.json', this.cache);
  }
}