/**
 * 抓取源注册表
 * --------------------------------------------------------------------------
 * 新增源：写好 xxx.source.ts 后在这里 push 一项即可，服务层会自动：
 *   · 把该源的分类并入全站分类表
 *   · 在后台「抓取素材」页可选
 */

import { CrawlSource } from './types';
import { duitangSource } from './duitang.source';
import { netbianSource } from './netbian.source';
import { bingimgSource } from './bingimg.source';

/** 启用中的抓取源（数组顺序即默认抓取顺序，靠前的优先消耗额度） */
export const SOURCES: CrawlSource[] = [duitangSource, netbianSource, bingimgSource];

export function getSource(id: string): CrawlSource | undefined {
  return SOURCES.find((s) => s.id === id);
}

/** 所有源支持的分类取并集（同 key 只保留一份，label/type 以先出现者为准） */
export function mergeSourceCategories(): { key: string; label: string; type: 'avatar' | 'wallpaper' }[] {
  const map = new Map<string, { key: string; label: string; type: 'avatar' | 'wallpaper' }>();
  for (const s of SOURCES) {
    for (const c of s.categories) {
      if (!map.has(c.key)) map.set(c.key, { key: c.key, label: c.label, type: c.type });
    }
  }
  return Array.from(map.values());
}

export * from './types';
export { readImageMeta } from './image';
export { composeTitle, isUnsafeText } from './title';
