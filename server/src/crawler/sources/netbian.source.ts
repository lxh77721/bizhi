/**
 * 抓取源：彼岸图网（pic.netbian.com）
 * --------------------------------------------------------------------------
 * 定位：**竖屏手机壁纸补充源 + 真实中文标题来源**。
 *       国内老牌 4K 壁纸站，「4K 手机壁纸」竖屏专区约 273 页 × 10 张 ≈ 2700 张。
 *
 * 它最大的价值不是分辨率（实测原图 850×1360，其实不如堆糖的 1080×2340），
 * 而是**列表/详情页自带真实中文标题**：
 *   alt="凡人修仙传 梅凝 微笑 玫瑰花 4K手机壁纸高清全屏"
 * → 天然长尾词，正好补齐「素材标题大量重复」这个内容质量问题。
 *
 * 两段式抓取（实测差异明显，必须走第二段才有原图）：
 *   列表页 /shoujibizhi/            → <img src="/uploads/...15353e5.jpg">  451×722 / 250KB  ← 缩略图
 *   详情页 /tupian/{id}.html        → <a id="img"><img src="/uploads/...1538c7f.jpg">  850×1360 / 819KB ← 原图
 *   注意：列表页给的地址正好等于详情页的 data-pic（小图），详情页的 src 才是原图。
 *   代价是每张图多一次请求，所以做了并发 3 + 间隔限速。
 *
 * ⚠️ 图片 CDN 有 **Referer 防盗链**：不带 Referer 直接下载返回 405，
 *    必须带 Referer: https://pic.netbian.com/（见 imageHeaders）。
 * ⚠️ 该专区混有「美女」类内容，对小程序审核不友好 → 标题命中敏感词直接跳过（title.ts isUnsafeText）。
 */

import * as cheerio from 'cheerio';
import { CrawlSource, CrawledImage, SourceCategory } from './types';
import { fetchText, sleep } from './http';
import { isUnsafeText } from './title';

const BASE = 'https://pic.netbian.com';
const LIST_PATH = '/shoujibizhi/';

/**
 * 是否进详情页换原图。
 * 关闭后只用列表页地址（451×722，体积小、速度快一倍），画质会明显下降。
 */
const FETCH_ORIGINAL = true;
/** 详情页并发数（对源站保持礼貌，也是避免被封的保险） */
const DETAIL_CONCURRENCY = 3;

/** 4K 手机壁纸竖屏专区（一个列表混装多类内容，由 resolveCategory 二次归类） */
const CATEGORIES: SourceCategory[] = [
  { key: 'wallpaper_4K', label: '4K', type: 'wallpaper', keyword: '4K手机壁纸' },
];

/** 标题关键词 → 本站分类（按优先级从上到下匹配） */
const CATEGORY_RULES: Array<{ key: string; re: RegExp }> = [
  {
    key: 'wallpaper_动漫',
    re: /动漫|动画|二次元|修仙|原神|崩坏|初音|辉夜|三月七|梅凝|角色|游戏|三国|火影|海贼|碧蓝|少女前线|明日方舟/,
  },
  {
    key: 'wallpaper_风景',
    re: /风景|山水|海|天空|星空|星|云|日出|日落|夕阳|森林|雪|花|湖|城市|夜景|山|瀑布|草原|沙滩/,
  },
  { key: 'wallpaper_文字', re: /文字|语录|台词|句子|字母/ },
  { key: 'wallpaper_简约', re: /简约|极简|纯色|渐变|线条/ },
  { key: 'wallpaper_可爱', re: /可爱|萌|动物|猫|狗|兔|熊|卡通/ },
];

/** 从图片路径里的日期片段推断发布时间（allimg/261004/ → 2026-10-04） */
function parseDateFromPath(path: string): number | undefined {
  let m = path.match(/allimg\/(\d{2})(\d{2})(\d{2})\//);
  if (m) {
    const ts = new Date(`20${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`).getTime();
    return isNaN(ts) ? undefined : ts;
  }
  m = path.match(/\/d\/file\/p\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (m) {
    const ts = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00+08:00`).getTime();
    return isNaN(ts) ? undefined : ts;
  }
  return undefined;
}

/** 取详情页里的原图地址（<a href="" id="img"><img src="原图">） */
async function fetchOriginalUrl(detailUrl: string): Promise<string | null> {
  try {
    const html = await fetchText(detailUrl, { Referer: `${BASE}${LIST_PATH}` });
    const $ = cheerio.load(html);
    const src = $('#img img').attr('src') || $('.photo-pic img').attr('src') || '';
    if (!src) return null;
    return src.startsWith('http') ? src : `${BASE}${src}`;
  } catch {
    return null;
  }
}

/** 简单并发池：把任务切成 N 批顺序执行 */
async function runPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    const res = await Promise.all(slice.map(fn));
    out.push(...res);
    if (i + concurrency < items.length) await sleep(250);
  }
  return out;
}

export const netbianSource: CrawlSource = {
  id: 'nb',
  name: '彼岸图网',
  desc: '4K 竖屏壁纸专区 · 自带真实中文标题 · 抓到的图按标题二次归类',
  categories: CATEGORIES,

  async fetchPage({ page }): Promise<CrawledImage[]> {
    const listUrl = page <= 1 ? `${BASE}${LIST_PATH}` : `${BASE}${LIST_PATH}index_${page}.html`;
    const html = await fetchText(listUrl, { Referer: `${BASE}${LIST_PATH}` });
    const $ = cheerio.load(html);
    if (!$('ul.masonry li').length) return [];

    // ---- 第一段：列表页（拿到 sid / 标题 / 缩略图 / 尺寸）----
    interface Raw {
      sid: string;
      title: string;
      smallUrl: string;
      detailUrl: string;
      width: number;
      height: number;
    }
    const raws: Raw[] = [];
    $('ul.masonry li').each((_, li) => {
      const $li = $(li);
      const $a = $li.find('a[href*="/tupian/"]').first();
      const $img = $li.find('img').first();
      if (!$a.length || !$img.length) return;

      const href = $a.attr('href') || '';
      const src = $img.attr('src') || '';
      const title = ($img.attr('alt') || '').trim();
      const idMatch = href.match(/\/tupian\/(\d+)\.html/);
      if (!src || !idMatch) return;
      // 内容审核风险过滤（美女类）
      if (isUnsafeText(title)) return;

      raws.push({
        sid: idMatch[1],
        title,
        smallUrl: src.startsWith('http') ? src : `${BASE}${src}`,
        detailUrl: href.startsWith('http') ? href : `${BASE}${href}`,
        width: Number($li.attr('data-w')) || Number($img.attr('width')) || 0,
        height: Number($li.attr('data-h')) || Number($img.attr('height')) || 0,
      });
    });
    if (!raws.length) return [];

    // ---- 第二段：详情页换原图（失败则退回列表小图，不丢数据）----
    const originals = FETCH_ORIGINAL
      ? await runPool(raws, DETAIL_CONCURRENCY, (r) => fetchOriginalUrl(r.detailUrl))
      : raws.map(() => null);

    const out: CrawledImage[] = [];
    raws.forEach((r, i) => {
      const url = originals[i] || r.smallUrl;
      out.push({
        sid: r.sid,
        url,
        // 列表声明的是缩略图尺寸，真实尺寸由服务层下载后按图片字节解析
        width: r.width,
        height: r.height,
        title: r.title,
        tags: ['4K', '手机壁纸'],
        publishedAt: parseDateFromPath(url),
      });
    });
    return out;
  },

  imageHeaders() {
    return { Referer: `${BASE}${LIST_PATH}` };
  },

  resolveCategory(item, fallbackKey) {
    const t = item.title || '';
    for (const rule of CATEGORY_RULES) {
      if (rule.re.test(t)) return rule.key;
    }
    return fallbackKey;
  },
};
