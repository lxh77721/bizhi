import { Controller, Get } from '@nestjs/common';
import { FileStore } from '@/common/file-store.service';
import { MATERIALS, CATEGORIES, MaterialItem, Category } from '@/materials/materials.data';

/**
 * 存储健康检查（公开、无鉴权，不返回任何密钥与路径）
 * --------------------------------------------------------------------------
 * 线上「跑几小时后数据回到初始状态」这类问题的根因通常只有一个：
 * 持久化没真的生效，数据只写在容器本地。这个接口把「数据库到底有没有在用」
 * 直接暴露出来，避免继续靠猜。
 *
 *   GET /api/health
 *   → { storage: { database: true, state: 'ok', pendingWrites: 0, materialCount: 1234 } }
 */
@Controller('health')
export class StorageController {
  constructor(private readonly store: FileStore) {}

  @Get()
  check() {
    const diag = this.store.diagnostics();
    const doc = this.store.read<{ materials: MaterialItem[]; categories: Category[] }>(
      'materials.json',
      { materials: MATERIALS, categories: CATEGORIES },
    );
    return {
      status: 'success',
      data: {
        time: new Date().toISOString(),
        storage: {
          /** true = 数据真正落在数据库里（实例回收/重新部署都不会丢） */
          database: diag.dbEnabled && diag.dbState === 'ok',
          state: diag.dbState,
          /** >0 表示还有改动没写进数据库 */
          pendingWrites: diag.pendingKeys.length,
          lastDbWriteAt: diag.lastDbWriteAt ?? null,
          materialCount: Array.isArray(doc.materials) ? doc.materials.length : 0,
          categoryCount: Array.isArray(doc.categories) ? doc.categories.length : 0,
        },
      },
    };
  }
}
