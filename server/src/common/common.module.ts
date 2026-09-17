import { Global, Module } from '@nestjs/common';
import { FileStore } from '@/common/file-store.service';

@Global()
@Module({
  providers: [FileStore],
  exports: [FileStore],
})
export class CommonModule {}