import { Module } from '@nestjs/common';
import { AdminService } from '@/admin/admin.service';
import { AdminGuard } from '@/admin/admin.guard';
import { AdminAuthController, AdminController } from '@/admin/admin.controller';
import { MaterialsModule } from '@/materials/materials.module';
import { ConfigModule } from '@/config/config.module';
import { StatsModule } from '@/stats/stats.module';

@Module({
  imports: [MaterialsModule, ConfigModule, StatsModule],
  providers: [AdminService, AdminGuard],
  controllers: [AdminAuthController, AdminController],
})
export class AdminModule {}