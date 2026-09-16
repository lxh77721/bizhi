import { Module } from '@nestjs/common';
import { AiController } from '@/ai/ai.controller';
import { AiService } from '@/ai/ai.service';

@Module({
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}