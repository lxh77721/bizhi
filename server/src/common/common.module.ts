import { Global, Module } from '@nestjs/common';
import { FileStore } from '@/common/file-store.service';
import { OssService } from '@/common/oss.service';
import { ConfigModule } from '@/config/config.module';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [FileStore, OssService],
  exports: [FileStore, OssService],
})
export class CommonModule {}