import { Controller, Post } from '@nestjs/common';
import { StatsService } from '@/stats/stats.service';

/** 客户端事件上报（无需鉴权，用于统计解锁行为） */
@Controller('events')
export class EventsController {
  constructor(private readonly statsService: StatsService) {}

  /** POST /api/events/unlock —— 激励视频解锁下载一次 */
  @Post('unlock')
  unlock() {
    this.statsService.recordUnlock();
    return { status: 'success' };
  }
}