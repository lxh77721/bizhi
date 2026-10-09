import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { MaterialsModule } from '@/materials/materials.module';
import { CommonModule } from '@/common/common.module';
import { ConfigModule } from '@/config/config.module';
import { StatsModule } from '@/stats/stats.module';
import { AdminModule } from '@/admin/admin.module';
import { UserModule } from '@/user/user.module';

@Module({
  imports: [CommonModule, ConfigModule, StatsModule, MaterialsModule, AdminModule, UserModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
