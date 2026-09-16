import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { MaterialsModule } from '@/materials/materials.module';
import { AiModule } from '@/ai/ai.module';

@Module({
  imports: [MaterialsModule, AiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
