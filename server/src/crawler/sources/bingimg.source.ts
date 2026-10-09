/**
 * 抓取源：必应图片搜索（cn.bing.com/images/async）
 * --------------------------------------------------------------------------
 * 定位：**全网覆盖面补充源**。堆糖/彼岸只能覆盖它们自家图库，
 *       而「抖音/小红书爆款头像」经常散落在微博、贴吧、个人站、其它图库，
 *       必应图搜是目前唯一能把这些一起捞出来的入口（返回结果里 murl 为原图直链）。
 *
 * 接口：https://cn.bing.com/images/async?q=<词>&first=<起始序号>&count=<条数>&mmasync=1
 * 返回 HTML 片段，每条结果挂在 <a class="iusc" m="{...}"> 的 m 属性里（HTML 实体转义过的 JSON）：
 *   { murl: 原图直链, turl: 缩略图, t: 页面标题, desc: 描述, purl: 来源页 }
 *
 * ⚠️ 该源的三个已知风险（默认仍启用，可在后台按需关掉）：
 *   1. murl 指向第三方站点，部分站点有防盗链 → 下载失败率高于专门图库；
 *      失败会只计入 errors，不影响其它源。
 *   2. 返回结果与堆糖高度重叠 → 靠素材 id（source 前缀 + 源站 ID）去重。
 *   3. 版权状态不受控 → 与其它源一样，仅建议内部打样/灰度使用。
 */

import { CrawlSource, CrawledImage, SourceCategory } from './types';
import { fetchText } from './http';
import { isUnsafeText } from './title';

const ENDPOINT = 'https://cn.bing.com/images/async';
const REFERER = 'https://cn.bing.com/images/search';

/** 单次请求条数上限（实测 35 稳定，再多会被截断，翻页交给 first） */
const PAGE_SIZE_MAX = 35;

/** 只补堆糖薄弱/爆款向的类目，避免无谓重复 */
const CATEGORIES: SourceCategory[] = [
  { key: 'avatar_douyintouxiang', label: '抖音头像', type: 'avatar', keyword: '抖音头像 高清' },
  { key: 'avatar_qinglvtouxiang', label: '情侣头像', type: 'avatar', keyword: '情侣头像 高清 一对' },
  { key: 'avatar_gaojigantouxiang', label: '高级感头像', type: 'avatar', keyword: '高级感头像 高清' },
  { key: 'avatar_shadiatouxiang', label: '沙雕头像', type: 'avatar', keyword: '沙雕头像 搞笑' },
  { key: 'avatar_emotouxiang', label: 'emo头像', type: 'avatar', keyword: 'emo头像 伤感' },
  { key: 'wallpaper_治愈', label: '治愈', type: 'wallpaper', keyword: '治愈系壁纸 手机' },
  { key: 'wallpaper_暗黑', label: '暗黑', type: 'wallpaper', keyword: '暗黑系壁纸 手机' },
  { key: 'wallpaper_文字', label: '文字', type: 'wallpaper', keyword: '文字壁纸 手机' },
  { key: 'wallpaper_简约', label: '简约', type: 'wallpaper', keyword: '简约壁纸 手机' },
];

/** HTML 实体反转义（m 属性里的 JSON 被转义成了 &quot; 等） */
function unescapeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** 从 murl 反推一个稳定 ID（必应不返回图片 id） */
function sidFromUrl(url: string): string {
  // 形如 .../20221011191419_f0e36.jpeg 或 .../6zS45xAwiqnvpox.jpg
  const file = url.split('/').pop() || url;
  const base = file.replace(/\.[a-z0-9]+$/i, '');
  let h = 2166136261;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${base.slice(0, 32)}_${(h >>> 0).toString(36)}`;
}

export const bingimgSource: CrawlSource = {
  id: 'bi',
  name: '必应图搜',
  /**
   * 默认关闭：它本质是通用网页图搜，语义噪音明显
   * （实测搜「沙雕头像 搞笑」会返回「波士顿国际沙雕节」的沙雕作品照片），
   * 并伴随第三方直链 404。堆糖已能稳定覆盖头像/壁纸，因此把它做成按需启用的补充源。
   */
  defaultEnabled: false,
  categories: CATEGORIES,

  async fetchPage({ keyword, page, limit }): Promise<CrawledImage[]> {
    const size = Math.min(limit, PAGE_SIZE_MAX);
    const first = (page - 1) * size + 1;
    const url = `${ENDPOINT}?q=${encodeURIComponent(keyword)}&first=${first}&count=${size}&mmasync=1`;
    const html = await fetchText(url, { Referer: REFERER });

    // 关键：必须区分「真的没有结果」和「被限流/返回验证页」。
    // 如果这里静默返回空数组，上层会误判为「已到末页」而整源停止抓取。
    if (!html.includes('murl')) {
      if (html.includes('iusc') || html.includes('dgControl')) return []; // 真·空结果
      throw new Error('必应返回非结果页（可能被限流或需要验证），已跳过本次请求');
    }

    const out: CrawledImage[] = [];
    const seen = new Set<string>();
    const re = /m="(\{[^"]*?murl[^"]*?\})"/g;
    let m: RegExpExecArray | null;

    while ((m = re.exec(html)) !== null) {
      let meta: any;
      try {
        meta = JSON.parse(unescapeHtml(m[1]));
      } catch {
        continue;
      }
      const murl: string = meta?.murl || '';
      if (!murl || !/^https?:\/\//i.test(murl)) continue;
      if (seen.has(murl)) continue;
      seen.add(murl);

      const title: string = String(meta?.t || meta?.desc || '').trim();
      if (isUnsafeText(title)) continue;

      out.push({
        sid: sidFromUrl(murl),
        url: murl,
        // 必应多数结果不返回真实宽高 → 先置 0，由服务层下载后按图片字节解析真实尺寸
        width: Number(meta?.w) || 0,
        height: Number(meta?.h) || 0,
        title,
        tags: [],
      });
    }
    return out;
  },
};
