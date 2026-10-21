import { Injectable, BadRequestException } from '@nestjs/common';
import { MaterialsService, MaterialsFile } from '@/materials/materials.service';
import { OssService } from '@/common/oss.service';
import { FileStore } from '@/common/file-store.service';
import { WxSearchService } from '@/common/wx-search.service';
import { MaterialItem, Category } from '@/materials/materials.data';
import {
  SOURCES,
  CrawlSource,
  CrawledImage,
  mergeSourceCategories,
  readImageMeta,
  composeUniqueTitle,
  isUnsafeText,
  isAiContent,
} from './sources';
import { sleep, USER_AGENT } from './sources/http';

export interface CrawlOptions {
  /** 频道过滤：avatar=只抓头像、wallpaper=只抓壁纸；不传则两者都抓 */
  source?: 'avatar' | 'wallpaper';
  /** 指定抓取源 id（dt=堆糖 / nb=彼岸图网 / bi=必应图搜）；不传则用全部启用的源 */
  sources?: string[];
  /** 指定分类 key（可写全名 avatar_xxx，也可只写 avatar_ 之后的部分）；不传则抓该源匹配到的全部分类 */
  categories?: string[];
  /** 每个分类最多探测多少页（默认 50）。老分类前若干页往往全是已入库的图，需要往后翻才能捞到新图 */
  maxPages?: number;
  /** 每个分类**本次**最多新增多少张（默认 60）。按本次新增计数，已入库的历史素材不占用额度 */
  maxImagesPerCategory?: number;
  /** 只抓该日期之后的图（YYYY-MM-DD）；仅对能拿到发布时间的源生效 */
  dateFrom?: string;
  /** 只抓该日期之前的图（YYYY-MM-DD） */
  dateTo?: string;
}

interface Stat {
  created: number;
  skipped: number;
  errors: number;
}

/** 一次抓取任务的汇总结果 */
export interface CrawlResult {
  created: number;
  skipped: number;
  errors: number;
  /** 兼容旧后台字段名（= errors） */
  failed: number;
  newCategories: number;
  /** 本次新增是否已确认写入数据库。false = 只进了内存，实例一回收就会丢 */
  saved: boolean;
  /** 返回时仍在待落库队列里的键（saved=false 时用来定位） */
  pending: number;
  detail: string;
}

/** 抓取任务状态（供后台轮询；抓取耗时通常在分钟级，必须异步执行） */
export interface CrawlTaskState {
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  /** 当前进度描述，如「堆糖 · 女生头像 · 已新增 12」 */
  progress: string;
  result: CrawlResult | null;
  error: string | null;
}

/** 一次请求向源站要多少条 */
const PAGE_BATCH = 40;

/**
 * 每新增多少张做一次「落库检查点」。
 * --------------------------------------------------------------------------
 * 抓取是分钟级任务，若只在全部结束时保存一次，中途任何意外（实例被回收、
 * 进程被杀、部署切换）都会让整批成果一起消失。分批保存后最多只丢最后几张，
 * 且已入库的部分在后台「已有 N 张」里立刻可见。
 */
const CHECKPOINT_EVERY = 10;

/**
 * 单次落库等待上限。数据库失联时 supabase 客户端的请求可能长时间不返回，
 * 若不设上限，抓取任务会永远停在「正在写入数据库…」，后台再也发不出下一次抓取。
 * 超时按「未确认落库」处理（返回 saved=false，由前端显式提示）。
 */
const FLUSH_TIMEOUT_MS = 20000;

/**
 * 每个分类默认最多探测多少页。
 * 不能设太小：重复抓取时前若干页往往全是已入库的图，必须往后翻才能捞到新图。
 * 实际会在「本次新增额度用满」或「源站翻到末页」时提前结束，所以这里给足冗余即可。
 */
const DEFAULT_MAX_PAGES = 50;

/** 头像：要求接近方形（避免把长图/表情包混进头像频道） */
const AVATAR_RATIO = { min: 0.7, max: 1.43 };
/** 壁纸：要求竖屏（手机壁纸），横屏图在小程序里会被裁切变形 */
const WALLPAPER_MIN_RATIO = 1.05;

/** 单张图体积上限，避免把超大原图灌进对象存储 */
const MAX_BYTES = 12 * 1024 * 1024;
/** 低于此体积视为占位图/防盗链返回的假图 */
const MIN_BYTES = 6 * 1024;

/**
 * 素材抓取服务（多源编排）
 * --------------------------------------------------------------------------
 * 只做编排，不关心站点结构 —— 站点差异全部封装在 crawler/sources/*.source.ts：
 *   分类并集落库 → 逐源逐分类翻页 → 去重 → 下载 → 读真实尺寸/格式 → 上传对象存储 → 落库
 *
 * 当前启用的源（见 sources/index.ts）：
 *   dt  堆糖       头像+壁纸主源，JSON 接口，量大、无防盗链
 *   nb  彼岸图网   4K 竖屏手机壁纸，列表页 alt 自带真实中文标题（需 Referer）
 *   bi  必应图搜   全网覆盖补充源（第三方直链，失败率略高）
 */
@Injectable()
export class CrawlerService {
  private running = false;
  /** 最近一次（或正在进行的）抓取任务状态 */
  private task: CrawlTaskState = {
    running: false,
    startedAt: null,
    finishedAt: null,
    progress: '',
    result: null,
    error: null,
  };

  constructor(
    private readonly materials: MaterialsService,
    private readonly oss: OssService,
    private readonly store: FileStore,
    private readonly wxSearch: WxSearchService,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  /** 查询任务状态（含进度与结果）；后台轮询用 */
  getTaskState(): CrawlTaskState {
    return { ...this.task, running: this.running };
  }

  /* ------------------------------ 通用工具 ------------------------------ */

  private async fetchBuffer(url: string, extraHeaders: Record<string, string> = {}): Promise<Buffer> {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, ...extraHeaders },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error(`图片过大 ${(buf.length / 1048576).toFixed(1)}MB`);
    if (buf.length < MIN_BYTES) throw new Error(`图片过小 ${buf.length}B，疑似防盗链占位图`);
    return buf;
  }

  /** 写入对象存储。FaaS 部署文件系统只读，因此必须配置对象存储。 */
  private async storeBuffer(
    buf: Buffer,
    source: string,
    folder: string,
    fileName: string,
    contentType: string,
  ): Promise<string> {
    if (!this.oss.isConfigured()) {
      throw new Error('未配置对象存储（OSS），无法保存抓取图片；请到后台「配置」页填写并保存对象存储信息');
    }
    return this.oss.upload(buf, `${source}/${folder}/${fileName}`, contentType);
  }

  /** 分类并集落库：只增不删（仍被源声明 或 还挂着素材的分类会保留） */
  private syncCategories(data: { categories: Category[]; materials: MaterialItem[] }, declared: Category[]): Category[] {
    const keys = new Set(declared.map((c) => c.key));
    data.categories = data.categories.filter(
      (c) => keys.has(c.key) || data.materials.some((m) => m.category === c.key),
    );
    for (const c of declared) {
      const exist = data.categories.find((x) => x.key === c.key);
      if (exist) {
        exist.label = c.label;
        exist.type = c.type;
      } else {
        data.categories.push({ ...c });
      }
    }
    this.materials.saveData(data);
    return data.categories;
  }

  /**
   * 落库检查点：把当前文档写进存储并**等它真的落库**。
   * --------------------------------------------------------------------------
   * 生成任务结束后台异步执行，而 serverless 实例在「没有进行中的请求」时会被回收。
   * 如果只是 saveData() 然后 fire-and-forget，平台在轮询停止的瞬间回收实例，
   * 那批写请求就再也不会完成 —— 表现为「后台提示已新增 60 张，但图片数量还是 0」。
   * 因此每一批新增后都必须 await 到确认落库。
   */
  private async checkpoint(data: MaterialsFile): Promise<boolean> {
    this.materials.saveData(data);
    return this.flushWithTimeout();
  }

  /** 等待落库，但不超过 FLUSH_TIMEOUT_MS（超时视为未确认，不阻塞任务收尾） */
  private async flushWithTimeout(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.store.flushNow(),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), FLUSH_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** 日期过滤：优先用源站发布时间，缺失时不拦截（交由分类额度控制） */
  private inDateRange(ts: number | undefined, from?: string, to?: string): boolean {
    if (!from && !to) return true;
    if (!ts) return true;
    if (from) {
      const f = new Date(`${from}T00:00:00+08:00`).getTime();
      if (!isNaN(f) && ts < f) return false;
    }
    if (to) {
      const t = new Date(`${to}T23:59:59+08:00`).getTime();
      if (!isNaN(t) && ts > t) return false;
    }
    return true;
  }

  /** 按频道校验宽高比：头像要方形、壁纸要竖屏 */
  private ratioOk(type: 'avatar' | 'wallpaper', w: number, h: number): boolean {
    if (!w || !h) return false;
    const r = h / w;
    if (type === 'avatar') return r >= AVATAR_RATIO.min && r <= AVATAR_RATIO.max;
    return r >= WALLPAPER_MIN_RATIO;
  }

  private resolveSources(ids?: string[]): CrawlSource[] {
    if (ids && ids.length) {
      const picked = SOURCES.filter((s) => ids.includes(s.id));
      if (!picked.length) {
        throw new BadRequestException(`未找到指定抓取源（可选：${SOURCES.map((s) => `${s.id}=${s.name}`).join('、')}）`);
      }
      return picked;
    }
    // 不指定时只跑「默认启用」的源，避免把低质量源混进日常抓取
    return SOURCES.filter((s) => s.defaultEnabled !== false);
  }

  /* ------------------------------ 主流程 ------------------------------ */

  /**
   * 启动抓取任务并**立即返回**。
   * ---------------------------------------------------------------------------
   * 抓取是分钟级任务（多源 × 多分类 × 逐张下载上传），而小程序 wx.request
   * 默认 60s 超时、FaaS 网关同样有超时，同步等待必然以「request:fail timeout」
   * 收场（用户以为失败、服务端其实还在跑）。因此改为后台执行 + 轮询查状态：
   *   POST /api/admin/crawl          → 立即返回 { started: true }
   *   GET  /api/admin/crawl/status   → 轮询进度与结果
   */
  start(opts: CrawlOptions = {}): { started: boolean } {
    if (this.running) throw new BadRequestException('已有抓取任务进行中');
    this.running = true;
    this.task = {
      running: true,
      startedAt: Date.now(),
      finishedAt: null,
      progress: '准备中…',
      result: null,
      error: null,
    };

    // 不 await：任务在后台跑，结果写入 this.task 供轮询读取
    void this.execute(opts)
      .then((r) => {
        this.task.result = r;
        this.task.progress = '已完成';
      })
      .catch((e: any) => {
        this.task.error = e?.message || String(e);
        this.task.progress = '抓取失败';
        console.error('[crawler] 任务失败', e);
      })
      .finally(() => {
        this.running = false;
        this.task.running = false;
        this.task.finishedAt = Date.now();
      });

    return { started: true };
  }

  /** 同步执行（供定时任务/测试使用；HTTP 接口请用 start） */
  async run(opts: CrawlOptions = {}): Promise<CrawlResult> {
    if (this.running) throw new BadRequestException('已有抓取任务进行中');
    this.running = true;
    try {
      return await this.execute(opts);
    } finally {
      this.running = false;
    }
  }

  private async execute(opts: CrawlOptions): Promise<CrawlResult> {
    const data = this.materials.getData();
    const enabled = this.resolveSources(opts.sources);
    if (!enabled.length) {
      throw new BadRequestException(`没有可用的抓取源（可选：${SOURCES.map((s) => `${s.id}=${s.name}`).join('、')}）`);
    }

    // 1) 分类并集（只增不删）
    const synced = this.syncCategories(data, mergeSourceCategories());
    await this.flushWithTimeout(); // 分类表先落库，避免任务开头就中断时新分类丢失
    const stripPrefix = (k: string) => k.replace(/^(avatar|wallpaper)_/, '');
    const selected = synced.filter((c) => {
      if (opts.source && c.type !== opts.source) return false;
      if (!opts.categories?.length) return true;
      return opts.categories.includes(c.key) || opts.categories.includes(stripPrefix(c.key));
    });

    // 2) 抓取上下文：本次新增额度计数 + 跨源 URL 去重 + 分分类标题去重
    const max = Math.max(1, opts.maxImagesPerCategory || 60);
    const maxPages = Math.max(1, opts.maxPages || DEFAULT_MAX_PAGES);
    // 额度按「本次新增」计：每个分类本次最多新增 max 张，历史库存不占用额度。
    // （旧实现用分类存量做判据，导致分类攒够 max 张后再抓取会被整个跳过、永远零新增）
    const addedByCategory = new Map<string, number>();
    for (const c of synced) addedByCategory.set(c.key, 0);
    const knownIds = new Set(data.materials.map((m) => m.id));
    const knownUrls = new Set(data.materials.map((m) => m.url));
    const titlesByCategory = new Map<string, Set<string>>();
    for (const c of synced) {
      titlesByCategory.set(c.key, new Set(data.materials.filter((m) => m.category === c.key).map((m) => m.title)));
    }

    const total: Stat = { created: 0, skipped: 0, errors: 0 };
    const details: string[] = [];
    /** 本次新增的素材 id：抓完自动推给搜一搜收录 */
    const createdIds: string[] = [];
    /** 距上次落库检查点又新增了多少张 */
    let sinceCheckpoint = 0;
    /** 本次任务是否所有新增都已确认落库（中途任何一次失败都会置 false） */
    let allSaved = true;

    // 3) 逐源抓取
    for (const src of enabled) {
      const targets = selected
        .map((c) => ({ cat: c, sc: src.categories.find((x) => x.key === c.key) }))
        .filter((x): x is { cat: (typeof selected)[number]; sc: NonNullable<typeof x.sc> } => !!x.sc);
      if (!targets.length) {
        details.push(`${src.name}：本次无匹配分类`);
        continue;
      }

      const stat: Stat = { created: 0, skipped: 0, errors: 0 };

      for (const { cat, sc } of targets) {
        if ((addedByCategory.get(cat.key) ?? 0) >= max) {
          stat.skipped++;
          continue;
        }
        // 整类跳过 AI 分类：若某个分类的检索词/名称本身就是 AI 内容（如「AI壁纸」），
        // 整类不抓，避免逐条白跑。
        if (isAiContent(sc.keyword, cat.label)) {
          stat.skipped++;
          continue;
        }
        this.task.progress = `${src.name} · ${cat.label} · 已新增 ${total.created}`;

        for (let page = 1; page <= maxPages; page++) {
          if ((addedByCategory.get(cat.key) ?? 0) >= max) break;
          let batch: CrawledImage[] = [];
          try {
            batch = await src.fetchPage({ keyword: sc.keyword, page, limit: PAGE_BATCH });
          } catch (e: any) {
            // 单页失败重试一次，仍失败则放弃该分类（继续下一个分类，不影响其它源）
            try {
              await sleep(1500);
              batch = await src.fetchPage({ keyword: sc.keyword, page, limit: PAGE_BATCH });
            } catch (e2: any) {
              stat.errors++;
              console.warn(`[crawler] ${src.name} 第 ${page} 页抓取失败`, e2?.message);
              break;
            }
          }
          if (!batch.length) break;

          for (const item of batch) {
            if ((addedByCategory.get(cat.key) ?? 0) >= max) break;

            const id = `${src.id}_${item.sid}`;
            if (knownIds.has(id) || knownUrls.has(item.url)) {
              stat.skipped++;
              continue;
            }
            if (!this.inDateRange(item.publishedAt, opts.dateFrom, opts.dateTo)) {
              stat.skipped++;
              continue;
            }

            // 跳过 AI 生成内容：源站把「AI绘画/AI生成/Midjourney」的图混在
            // 正常分类里，光靠分类过滤挡不住，必须按标题/标签逐条识别。
            // 放在下载之前，避免为注定被丢弃的图浪费带宽与对象存储额度。
            if (isAiContent(item.title, ...(item.tags || []))) {
              stat.skipped++;
              continue;
            }

            // 归类：源可覆盖默认分类（如彼岸图网的混装列表）
            const categoryKey = src.resolveCategory?.(item, cat.key) || cat.key;
            const category = synced.find((c) => c.key === categoryKey) || cat;
            // 目标分类自身也有本次新增额度（重定向后 cat.key 与 category.key 可能不同，
            // 必须按最终落库的分类单独判额度，否则会把某个分类灌爆）
            const targetAdded = addedByCategory.get(categoryKey) ?? 0;
            if (targetAdded >= max) {
              stat.skipped++;
              continue;
            }

            let buf: Buffer;
            try {
              buf = await this.fetchBuffer(item.url, src.imageHeaders?.(item.url));
            } catch (e: any) {
              stat.errors++;
              console.warn(`[crawler] ${src.name} 下载失败 ${item.url}`, e?.message);
              continue;
            }

            // 以图片字节为准：真实尺寸 + 真实格式
            const meta = readImageMeta(buf);
            // 只收静态图：动图（GIF）在瀑布流卡片里不显示首帧、体积也大，混进来是噪音
            if (!meta || meta.mime === 'image/gif') {
              stat.skipped++;
              continue;
            }
            const width = meta.width || item.width || 0;
            const height = meta.height || item.height || 0;
            if (!this.ratioOk(category.type || 'avatar', width, height)) {
              stat.skipped++;
              continue;
            }

            const type = (category.type || 'avatar') as 'avatar' | 'wallpaper';
            const title = this.pickTitle({
              item,
              label: category.label,
              type,
              keyword: sc.keyword,
              used: titlesByCategory.get(category.key) || new Set<string>(),
            });
            if (!title || isUnsafeText(title)) {
              stat.skipped++;
              continue;
            }

            const ext = meta.ext;
            const mime = meta.mime;
            let storedUrl: string;
            try {
              storedUrl = await this.storeBuffer(
                buf,
                src.id,
                categoryKey.replace(/^[a-z]+_/i, '') || 'misc',
                `${item.sid}.${ext}`,
                mime,
              );
            } catch (e: any) {
              stat.errors++;
              console.warn(`[crawler] ${src.name} 上传失败 ${item.sid}`, e?.message);
              continue;
            }

            data.materials.unshift({
              id,
              title,
              category: category.key,
              url: storedUrl,
              thumbUrl: storedUrl,
              width,
              height,
              tags: [category.label, type === 'avatar' ? '头像' : '壁纸', ...(item.tags || [])].slice(0, 6),
              type,
            });
            knownIds.add(id);
            knownUrls.add(item.url);
            titlesByCategory.get(categoryKey)?.add(title);
            addedByCategory.set(categoryKey, targetAdded + 1);
            stat.created++;
            total.created++;
            createdIds.push(id);
            this.task.progress = `${src.name} · ${category.label} · 已新增 ${total.created}`;

            // 分批落库：长任务中途被回收也不至于整批消失
            if (++sinceCheckpoint >= CHECKPOINT_EVERY) {
              sinceCheckpoint = 0;
              if (!(await this.checkpoint(data))) allSaved = false;
            }

            await sleep(120); // 控制对源站与对象存储的压力
          }

          await sleep(320); // 页间间隔
        }

        // 每个分类收尾也落一次库：用户切回后台就能立刻看到「已有 N 张」在涨
        if (sinceCheckpoint > 0) {
          sinceCheckpoint = 0;
          if (!(await this.checkpoint(data))) allSaved = false;
        }
      }

      details.push(`${src.name}(新增 ${stat.created} / 跳过 ${stat.skipped} / 失败 ${stat.errors})`);
      total.skipped += stat.skipped;
      total.errors += stat.errors;
    }

    // 收尾落库：**必须等到确认写入数据库**才允许把任务标记为完成。
    // 否则前端看到「已新增 N」而数据库里没有，实例一回收数据就没了。
    this.task.progress = '正在写入数据库…';
    if (!(await this.checkpoint(data))) allSaved = false;
    const diag = this.store.diagnostics();
    const pending = diag.pendingKeys.length;
    if (pending > 0) allSaved = false;

    if (!allSaved) {
      details.push(
        diag.dbEnabled
          ? `⚠️ 有 ${total.created} 张已抓取但**未确认写入数据库**（待落库 ${pending} 项），实例回收后会丢失；` +
            `请检查后台「持久化状态」是否为红色，并点「立即落库」重试`
          : `⚠️ 未检测到数据库环境变量，这批新增只写在服务器本地文件，实例回收后会丢失；` +
            `请在部署环境配置数据库（COZE_SUPABASE_URL / COZE_SUPABASE_ANON_KEY）`,
      );
      console.error(
        `[crawler] 抓取完成但落库未确认：created=${total.created} pending=${pending} ` +
          `dbEnabled=${diag.dbEnabled} state=${diag.dbState} lastError=${diag.lastError || '无'}`,
      );
    }

    // 新页面主动推给搜一搜收录：被动等爬虫来抓对冷启动太慢。
    // 推送失败不影响抓取结果本身（pushPages 内部已兜底，这里只透出提示）。
    if (createdIds.length > 0 && allSaved) {
      const pushed = await this.wxSearch.pushMaterialDetails(createdIds);
      if (pushed) {
        details.push(
          pushed.ok
            ? `搜一搜收录推送：已推送 ${pushed.total} 个新页面`
            : `搜一搜收录推送未成功（errcode=${pushed.errcode}）：${pushed.hint}`,
        );
      }
    }

    return {
      created: total.created,
      skipped: total.skipped,
      errors: total.errors,
      // 兼容旧后台字段名
      failed: total.errors,
      newCategories: synced.length,
      saved: allSaved,
      pending,
      detail: details.join('；') || '无可用源',
    };
  }

  /**
   * 生成标题：优先源站真标题，其次标签组合，最后形容词池。
   * 实现复用 sources/title.ts 的 composeUniqueTitle —— 与存量标题回填走同一套规则，
   * 避免「新图用新规则、老图用老规则」两套逻辑分叉。
   */
  private pickTitle(args: {
    item: CrawledImage;
    label: string;
    type: 'avatar' | 'wallpaper';
    keyword: string;
    used: Set<string>;
  }): string {
    const { item, label, type, keyword, used } = args;
    return composeUniqueTitle(
      { rawTitle: item.title, tags: item.tags, label, type, sid: item.sid, keyword },
      used,
    );
  }
}
