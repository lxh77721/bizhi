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
  async check() {
    // 主动自检一次：凭据可能是启动后才注入的，这里不等后台定时器，当场给结论
    try {
      await this.store.probeDatabase();
    } catch {
      /* 探测失败不影响下面的诊断输出 */
    }
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
          /** 是否拿到了数据库凭据（false = 平台没注入，任何代码改动都救不了，先去控制台绑定数据库） */
          dbEnabled: diag.dbEnabled,
          /** connecting=启动中 / ok=在用 / degraded=降级为本地文件 */
          state: diag.dbState,
          /** >0 表示还有改动没写进数据库 */
          pendingWrites: diag.pendingKeys.length,
          dbWritesOk: diag.dbWritesOk,
          lastError: diag.lastError ?? null,
          lastDbWriteAt: diag.lastDbWriteAt ?? null,
          materialCount: Array.isArray(doc.materials) ? doc.materials.length : 0,
          categoryCount: Array.isArray(doc.categories) ? doc.categories.length : 0,
        },
      },
    };
  }
}
