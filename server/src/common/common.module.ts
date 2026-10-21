import { Global, Module } from '@nestjs/common';
import { FileStore } from '@/common/file-store.service';
import { OssService } from '@/common/oss.service';
import { WxSearchService } from '@/common/wx-search.service';
import { StorageController } from '@/common/storage.controller';
import { ConfigModule } from '@/config/config.module';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [StorageController],
  providers: [FileStore, OssService, WxSearchService],
  exports: [FileStore, OssService, WxSearchService],
})
export class CommonModule {}
