import { Injectable, OnModuleInit } from '@nestjs/common';
import { FileStore } from '@/common/file-store.service';

/** 首页展示的管理统计指标（持久化到 app_store 的 stats.json 键） */
export interface Stats {
  unlockCount: number;   // 激励视频解锁下载累计次数
}

const DEFAULT_STATS: Stats = {
  unlockCount: 0,
};

@Injectable()
export class StatsService implements OnModuleInit {
  constructor(private readonly store: FileStore) {}

  onModuleInit() {
    console.log(`[Stats] 已加载统计: 解锁 ${this.get().unlockCount} 次`);
  }

  /** 统计：每次实时取（数据单一来源在 FileStore），避免用旧副本覆盖别的实例的计数 */
  get(): Stats {
    return Object.assign({}, DEFAULT_STATS, this.store.read('stats.json', DEFAULT_STATS));
  }

  recordUnlock() {
    const cur = this.get();
    this.store.write('stats.json', { ...cur, unlockCount: cur.unlockCount + 1 });
  }
}
