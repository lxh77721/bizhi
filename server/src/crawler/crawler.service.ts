import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { MaterialsService } from '@/materials/materials.service';
import { MaterialItem, Category } from '@/materials/materials.data';

/**
 * 头像素材爬虫（来源：https://www.33990.net/ 微信头像网）
 * --------------------------------------------------------------------------
 * 行为说明：
 *  - 只抓取"图片 URL"，下载到本地物理目录 server/public/materials/crawler/，
 *    并通过现有素材库（materials.json）入库，前台即可展示。
 *  - 默认排除动漫/卡通等可能涉及 IP 侵权的分类。
 *  - 低频率、小并发，减少对目标站点的压力；已抓过的图片按 URL 去重，不会重复入库。
 *  - 版权提示：抓取内容仅作为个人素材收集，商用前请核实授权，勿使用明星/真人无授权素材。
 */

export interface CrawlOptions {
  /** 抓取哪些分类（站路径）；缺省用默认配置 */
  categories?: string[];
  /** 每个分类最多抓取的文章页数（1 = 只看分类列表第 1 页） */
  maxPages?: number;
  /** 每个分类最多入库的图片数 */
  maxImages?: number;
  /** 每类图片入库上限（总） */
  maxImagesPerCategory?: number;
  /** 请求间隔毫秒 */
  delayMs?: number;
}

interface CrawlResult {
  created: number;
  skipped: number;
  errors: number;
  newCategories: string[];
  detail: Record<string, { created: number; skipped: number; errors: number }>;
}

interface TargetCategory {
  path: string; // 站内分类路径，如 weixintouxiang
  label: string; // 展示名
}

/** 默认抓取分类（排除动漫/卡通等 IP 敏感分类） */
const DEFAULT_CATEGORIES: TargetCategory[] = [
  { path: 'weixintouxiang', label: '微信头像' },
  { path: 'nanshengtouxiang', label: '男生头像' },
  { path: 'nvshengtouxiang', label: '女生头像' },
  { path: 'douyintouxiang', label: '抖音头像' },
];

const BASE = 'http://www.33990.net';

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger('Crawler');
  /** 防止定时任务重复运行时并发执行 */
  private running = false;

  constructor(private readonly materials: MaterialsService) {}

  /** 每日凌晨 4 点自动抓取（避开网站访问高峰；增量按 URL 去重） */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'crawler_daily' })
  async daily() {
    this.logger.log('[Crawler] 每日定时抓取开始');
    try {
      await this.run();
    } catch (e) {
      this.logger.error(`[Crawler] 定时抓取失败: ${(e as Error).message}`);
    }
  }

  /** 是否正在抓取 */
  isRunning() {
    return this.running;
  }

  /** 执行抓取：分类 → 分页 → 文章 → 图片下载 → 入库 */
  async run(options: CrawlOptions = {}): Promise<CrawlResult> {
    if (this.running) {
      throw new Error('抓取任务正在进行中，请稍后再试');
    }
    this.running = true;

    const maxPages = Math.min(Math.max(options.maxPages ?? 2, 1), 50);
    const maxImagesPerCategory = options.maxImagesPerCategory
      ? Math.min(options.maxImagesPerCategory, 1000)
      : 40;
    const delayMs = Math.max(options.delayMs ?? 400, 100);

    // 目标分类：显式指定或默认
    const targets: TargetCategory[] = options.categories?.length
      ? options.categories.map((p) => ({ path: p, label: p }))
      : DEFAULT_CATEGORIES;

    const allLinks: string[] = [];
    // 收集每个分类的累计图片 URL，先统计总量，避免超出磁盘
    const bucketMap = new Map<string, string[]>(); // key -> urls

    for (const t of targets) {
      const key = `crawler_${t.path}`;
      const urls = new Set<string>();
      await this.collectImages(t.path, maxPages, urls, delayMs);
      bucketMap.set(key, [...urls].slice(0, maxImagesPerCategory));
      allLinks.push(...bucketMap.get(key)!);
    }

    if (allLinks.length === 0) {
      this.running = false;
      return { created: 0, skipped: 0, errors: 0, newCategories: [], detail: {} };
    }

    // 现有分类 upsert（避免重复新增）
    const data = this.materials.getData();
    const newCategories: string[] = [];
    for (const t of targets) {
      const key = `crawler_${t.path}`;
      const exists = data.categories.some((c) => c.key === key);
      if (!exists) {
        const cat: Category = { key, label: t.label || key, icon: '' };
        data.categories.push(cat);
        newCategories.push(key);
      }
      // 补中文 label（显式指定 path 时可能没有 label，分类不存在则用 path）
      const found = data.categories.find((c) => c.key === key);
      if (found && t.label && !found.label) found.label = t.label;
    }
    this.materials.saveData(data);

    // 下载并入库（按 URL 去重）
    const result: CrawlResult = {
      created: 0,
      skipped: 0,
      errors: 0,
      newCategories,
      detail: {},
    };

    for (const t of targets) {
      const key = `crawler_${t.path}`;
      const urls = bucketMap.get(key) || [];
      const d = await this.downloadAndSave(key, t.label || key, urls, delayMs);
      result.created += d.created;
      result.skipped += d.skipped;
      result.errors += d.errors;
      result.detail[key] = d;
    }

    this.running = false;
    this.logger.log(
      `[Crawler] 完成：新增 ${result.created}，跳过 ${result.skipped}，失败 ${result.errors}，新分类 ${JSON.stringify(newCategories)}`,
    );
    return result;
  }

  /** 收集分类图片 URL（分页 + 文章页正文） */
  private async collectImages(
    catePath: string,
    maxPages: number,
    out: Set<string>,
    delayMs: number,
  ): Promise<void> {
    // 1) 分类列表页（含缩略图，通常即是原图）
    for (let page = 1; page <= maxPages; page++) {
      const cateUrl = page === 1 ? `${BASE}/${catePath}` : `${BASE}/${catePath}/${page}`;
      try {
        const html = await this.fetch(cateUrl);
        const $ = this.parse(html);
        $('img').each((_, el) => {
          const src = $(el).attr('src') || $(el).attr('data-src') || '';
          if (src && /img\.5km\.net/.test(src)) out.add(this.abs(src));
        });
        await this.sleep(delayMs);
      } catch {
        // 到最后一页则中断
        if (page > 1) break;
      }
    }

    // 2) 前两页文章详情页补充正文大图（去重）
    const artLinks = new Set<string>();
    for (let page = 1; page <= Math.min(maxPages, 2); page++) {
      const cateUrl = page === 1 ? `${BASE}/${catePath}` : `${BASE}/${catePath}/${page}`;
      try {
        const html = await this.fetch(cateUrl);
        const $ = this.parse(html);
        $('a[href*="/s/"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const m = href.match(/\/s\/\d+\.html/);
          if (m) artLinks.add(`${BASE}${m[0]}`);
        });
        await this.sleep(delayMs);
      } catch {
        break;
      }
    }
    let n = 0;
    for (const artUrl of artLinks) {
      if (n++ > 60) break; // 避免过度抓取
      try {
        const html = await this.fetch(artUrl);
        const $ = this.parse(html);
        $('img').each((_, el) => {
          const src = $(el).attr('src') || $(el).attr('data-src') || '';
          if (src && /img\.5km\.net/.test(src)) out.add(this.abs(src));
        });
        await this.sleep(delayMs);
      } catch {
        /* 单篇文章失败忽略 */
      }
    }
  }

  /** 下载一组图片并写入素材库（按 url 去重） */
  private async downloadAndSave(
    categoryKey: string,
    categoryLabel: string,
    urls: string[],
    delayMs: number,
  ): Promise<{ created: number; skipped: number; errors: number }> {
    let created = 0;
    let skipped = 0;
    let errors = 0;

    const data = this.materials.getData();
    const existingUrls = new Set(data.materials.map((m) => m.url));

    const dir = this.targetDir();
    fs.mkdirSync(dir, { recursive: true });

    for (const url of urls) {
      const localUrl = `/static/materials/crawler/${this.fileNameFor(url)}`;
      let item: MaterialItem | undefined;
      let writeFlag = false;

      if (!existingUrls.has(localUrl)) {
        // 下载到本地
        try {
          const buf = await this.fetchBytes(url);
          fs.writeFileSync(path.join(dir, this.fileNameFor(url)), buf);
          writeFlag = true;
        } catch {
          errors++;
          continue;
        }
        const title = `${categoryLabel || '头像'} ${created + 1}`;
        const hash = createHash('sha1').update(url).digest('hex').slice(0, 10);
        item = {
          id: `cz_${hash}`,
          title,
          category: categoryKey,
          url: localUrl,
          thumbUrl: localUrl,
          width: 1024,
          height: 1024,
          tags: [categoryLabel, '头像', '抓取'],
        };
        created++;
      } else {
        skipped++;
      }

      if (writeFlag) {
        data.materials.unshift(item!);
        existingUrls.add(localUrl);
      }
      await this.sleep(delayMs);
    }

    if (created > 0) this.materials.saveData(data);
    return { created, skipped, errors };
  }

  private targetDir(): string {
    // 后端以 server 为工作目录启动，素材物理目录即 server/public
    return path.resolve(process.cwd(), 'public', 'materials', 'crawler');
  }

  private fileNameFor(url: string): string {
    const base = url.split('/').pop() || '';
    const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_');
    return clean || `img_${createHash('sha1').update(url).digest('hex').slice(0, 10)}.jpg`;
  }

  private abs(src: string): string {
    if (!src.startsWith('http')) return `${BASE}${src.startsWith('/') ? '' : '/'}${src}`;
    return src.replace(/^https?:/i, 'http:');
  }

  private parse(html: string) {
    return cheerio.load(html);
  }

  private async fetch(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        Referer: BASE,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  private async fetchBytes(url: string): Promise<Buffer> {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: BASE } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}