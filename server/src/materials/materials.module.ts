import { Module } from '@nestjs/common';
import { MaterialsController } from '@/materials/materials.controller';
import { MaterialsService } from '@/materials/materials.service';

@Module({
  controllers: [MaterialsController],
  providers: [MaterialsService],
  exports: [MaterialsService],
})
export class MaterialsModule {}