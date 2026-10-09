/**
 * 抓取源：堆糖（duitang.com）
 * --------------------------------------------------------------------------
 * 定位：**头像 + 壁纸主源**。中文互联网上「抖音/微信爆款头像」最集中的图库之一，
 *       用户在小红书/抖音看到的头像很多就来自这里。
 *
 * 接口：官方前端调用的 JSON 搜索接口（无需登录、无需 key）
 *   GET https://www.duitang.com/napi/blog/list/by_search/?kw=<词>&start=<偏移>&limit=<条数>
 *   → { status:1, data:{ total, next_start, object_list:[ { photo:{id,width,height,path}, msg, tags, add_datetime_ts } ] } }
 *
 * 实测（2026-10-09）：
 *   · 单次 limit 上限 100；深翻页到 start=900 仍有数据，start≥1000 返回空
 *     → 每个关键词约可稳定获得 1000 张
 *   · 壁纸类关键词（治愈/简约/文字/暗黑…）返回结果 30/30 均为竖屏，常见 1080×2340
 *   · 头像类关键词返回方形图，最高 2560×2560
 *   · 图片 CDN（dtstatic.com）**无防盗链**，不带 Referer 亦可直接下载
 *   · 需要带站点 Referer 才能正常返回 JSON
 *
 * 已知坑：`msg`（标题）绝大多数就是检索词本身，没有信息量，
 *         因此标题交给 title.ts 的生成器处理。
 */

import { CrawlSource, CrawledImage, SourceCategory } from './types';
import { fetchJson } from './http';

const ENDPOINT = 'https://www.duitang.com/napi/blog/list/by_search/';
const REFERER = 'https://www.duitang.com/';

/** 单次请求上限，实测超过 100 会被源站截断 */
const PAGE_SIZE_MAX = 100;

/**
 * 分类表。
 * key 沿用「avatar_ / wallpaper_ + 拼音」的既有命名，与存量素材保持一致，
 * 避免分类改 key 后已有素材变成孤儿数据。
 */
const CATEGORIES: SourceCategory[] = [
  // ---------- 头像 ----------
  { key: 'avatar_weixintouxiang', label: '微信头像', type: 'avatar', keyword: '微信头像' },
  { key: 'avatar_nvshengtouxiang', label: '女生头像', type: 'avatar', keyword: '女生头像' },
  { key: 'avatar_nanshengtouxiang', label: '男生头像', type: 'avatar', keyword: '男生头像' },
  { key: 'avatar_douyintouxiang', label: '抖音头像', type: 'avatar', keyword: '抖音头像' },
  { key: 'avatar_qinglvtouxiang', label: '情侣头像', type: 'avatar', keyword: '情侣头像' },
  { key: 'avatar_guimitouxiang', label: '闺蜜头像', type: 'avatar', keyword: '闺蜜头像' },
  { key: 'avatar_keaitouxiang', label: '可爱头像', type: 'avatar', keyword: '可爱头像' },
  { key: 'avatar_dongmantouxiang', label: '动漫头像', type: 'avatar', keyword: '动漫头像' },
  { key: 'avatar_insfengtouxiang', label: 'ins风头像', type: 'avatar', keyword: 'ins风头像' },
  { key: 'avatar_gaojigantouxiang', label: '高级感头像', type: 'avatar', keyword: '高级感头像' },
  { key: 'avatar_shadiatouxiang', label: '沙雕头像', type: 'avatar', keyword: '沙雕头像' },
  { key: 'avatar_emotouxiang', label: 'emo头像', type: 'avatar', keyword: 'emo头像' },

  // ---------- 壁纸 ----------
  { key: 'wallpaper_治愈', label: '治愈', type: 'wallpaper', keyword: '治愈壁纸' },
  { key: 'wallpaper_暗黑', label: '暗黑', type: 'wallpaper', keyword: '暗黑壁纸' },
  { key: 'wallpaper_简约', label: '简约', type: 'wallpaper', keyword: '简约壁纸' },
  { key: 'wallpaper_文字', label: '文字', type: 'wallpaper', keyword: '文字壁纸' },
  { key: 'wallpaper_可爱', label: '可爱', type: 'wallpaper', keyword: '可爱壁纸' },
  { key: 'wallpaper_艺术', label: '艺术', type: 'wallpaper', keyword: '艺术壁纸' },
  { key: 'wallpaper_风景', label: '风景', type: 'wallpaper', keyword: '风景壁纸' },
  { key: 'wallpaper_动漫', label: '动漫', type: 'wallpaper', keyword: '动漫壁纸' },
  { key: 'wallpaper_抽象', label: '抽象', type: 'wallpaper', keyword: '抽象壁纸' },
  { key: 'wallpaper_苹果', label: '苹果', type: 'wallpaper', keyword: '苹果壁纸' },
];

/** 可接受的最小边（小于此值当作头像缩略图/表情包，丢弃） */
const MIN_EDGE = 320;

export const duitangSource: CrawlSource = {
  id: 'dt',
  name: '堆糖',
  categories: CATEGORIES,

  async fetchPage({ keyword, page, limit }): Promise<CrawledImage[]> {
    const size = Math.min(limit, PAGE_SIZE_MAX);
    const start = (page - 1) * size;
    const url = `${ENDPOINT}?kw=${encodeURIComponent(keyword)}&start=${start}&limit=${size}`;
    const json = await fetchJson(url, { Referer: REFERER });

    // 区分「真·空结果」与「接口异常」：后者必须抛错，
    // 否则上层会把异常当成末页而静默停止整个分类的抓取。
    if (!json?.data) {
      throw new Error(`堆糖接口返回异常：status=${json?.status} message=${json?.message || '无'}`);
    }

    const list: any[] = json?.data?.object_list || [];
    const out: CrawledImage[] = [];

    for (const o of list) {
      const p = o?.photo;
      if (!p?.path || !p?.width || !p?.height) continue;
      // 只要博主上传的原图（/uploads/blog*），过滤用户头像与缩略图变体
      if (!/\/uploads\/blog/.test(p.path)) continue;
      if (/\.thumb\./.test(p.path)) continue;
      if (Math.min(p.width, p.height) < MIN_EDGE) continue;

      out.push({
        sid: String(p.id),
        url: p.path,
        width: p.width,
        height: p.height,
        title: o.msg,
        tags: Array.isArray(o.tags) ? o.tags : [],
        publishedAt: o.add_datetime_ts ? o.add_datetime_ts * 1000 : undefined,
      });
    }
    return out;
  },
};
