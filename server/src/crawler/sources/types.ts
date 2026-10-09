/**
 * 素材抓取「源适配器」通用类型
 * --------------------------------------------------------------------------
 * 每个抓取源实现一个 CrawlSource，CrawlerService 只负责编排
 * （去重 → 下载 → 上传对象存储 → 落库），不关心具体站点结构。
 *
 * 新增一个源只需两步：
 *   1. 在 sources/ 下新建 xxx.source.ts，实现 CrawlSource 接口
 *   2. 在 sources/index.ts 的 SOURCES 数组里注册
 */

export type MediaType = 'avatar' | 'wallpaper';

/** 源站抓到的单张图片（尚未下载） */
export interface CrawledImage {
  /** 源站内稳定 ID，用于生成素材 id（服务层会再加源前缀，保证跨源不冲突） */
  sid: string;
  /** 源站原始标题（可能为空或等于检索词） */
  title?: string;
  /** 原图直链 */
  url: string;
  width: number;
  height: number;
  /** 源站标签，用于生成标题与素材 tags */
  tags?: string[];
  /** 发布时间戳（ms），可选，用于日期过滤 */
  publishedAt?: number;
}

/** 源站分类 → 映射到本站一个可浏览分类 */
export interface SourceCategory {
  /** 本站分类 key（如 wallpaper_治愈）；同一 key 可被多个源共同填充 */
  key: string;
  /** 展示名 */
  label: string;
  /** 归属频道 */
  type: MediaType;
  /** 到源站检索时使用的关键词 */
  keyword: string;
}

export interface FetchPageOptions {
  keyword: string;
  /** 页码，从 1 开始 */
  page: number;
  /** 期望条数（源站可能会截断，如堆糖单次最多 100） */
  limit: number;
}

export interface CrawlSource {
  /** 源标识：同时用作素材 id 前缀与对象存储目录名，建议 2-6 位小写字母 */
  id: string;
  /** 源展示名（后台可选） */
  name: string;
  /**
   * 是否默认参与抓取。默认 true。
   * 达不到质量要求的源设为 false：不显式指定时不会被跑，但后台仍可手动勾选启用
   * （例如必应图搜覆盖面广、噪音也大，且部分第三方直链会 404）。
   */
  defaultEnabled?: boolean;
  /** 该源支持的分类；服务层把所有源的分类取并集作为全站分类表 */
  categories: SourceCategory[];
  /** 抓取一页；返回空数组表示已到末页 */
  fetchPage(opts: FetchPageOptions): Promise<CrawledImage[]>;
  /**
   * 下载图片时需要附加的请求头。
   * 部分站点（如彼岸图网）对图片 CDN 做了 Referer 防盗链，必须带上。
   */
  imageHeaders?(imageUrl: string): Record<string, string>;
  /**
   * 可选：把抓到的图重新归入某个本站分类。
   * 用于「一个列表页混装多类内容」的源（如彼岸图网 4K 手机壁纸列表混有动漫/风景/文字）。
   * 返回 undefined 表示沿用当前抓取分类。
   */
  resolveCategory?(item: CrawledImage, fallbackKey: string): string | undefined;
}
