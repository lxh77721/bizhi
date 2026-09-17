import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CrawlerService } from './crawler.service';
import { MaterialsModule } from '@/materials/materials.module';

/**
 * 定时素材抓取模块
 *  - @nestjs/schedule 提供定时触发（每天凌晨 4 点，避开高峰）
 *  - 也可通过管理接口 POST /api/admin/crawl 手动触发（见 admin.controller）
 */
@Module({
  imports: [ScheduleModule.forRoot(), MaterialsModule],
  providers: [CrawlerService],
  exports: [CrawlerService],
})
export class CrawlerModule {}