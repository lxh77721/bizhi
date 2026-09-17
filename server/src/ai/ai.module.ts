import { Module } from '@nestjs/common';
import { AiController } from '@/ai/ai.controller';
import { AiService } from '@/ai/ai.service';
import { ConfigModule } from '@/config/config.module';
import { StatsModule } from '@/stats/stats.module';

@Module({
  imports: [ConfigModule, StatsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}