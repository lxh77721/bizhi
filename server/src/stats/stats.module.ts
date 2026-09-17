import { Module } from '@nestjs/common';
import { StatsService } from '@/stats/stats.service';
import { EventsController } from '@/stats/events.controller';

@Module({
  providers: [StatsService],
  controllers: [EventsController],
  exports: [StatsService],
})
export class StatsModule {}