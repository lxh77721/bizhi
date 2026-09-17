import { Module } from '@nestjs/common';
import { ConfigService } from '@/config/config.service';
import { ConfigController } from '@/config/config.controller';

@Module({
  providers: [ConfigService],
  controllers: [ConfigController],
  exports: [ConfigService],
})
export class ConfigModule {}