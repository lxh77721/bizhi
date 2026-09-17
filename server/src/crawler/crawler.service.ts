import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { MaterialsService } from '@/materials/materials.service';
import { MaterialItem } from '@/materials/materials.data';

/**
 * 素材爬虫（双源）
 * --------------------------------------------------------------------------
 *  - source "avatar"   ：来源 https://www.33990.net/ 微信头像网（HTML 页面）
 *  - source "wallpaper"：来源 https://bz.sfbsh.cn/       免费壁纸站（JSON API）
 * 下载到本地物理目录 server/public/materials/{avatar|wallpaper}/，经 /static 访问，
 * 并将素材写入现有素材库（materials.json），前台头像/壁纸频道即时生效。
 *  - 默认排除动漫/卡通等可能涉及 IP 侵权的分类。
 *  - 低频率、小并发；已入库按 id/url 去重，重复运行不产生重复素材。
 *  - 版权提示：抓取内容仅作为个人素材收集，商用前请核实授权，勿使用明星/真人无授权素材。
 */

export interface CrawlOptions {
  /** 抓取源：avatar=头像、wallpaper=壁纸；缺省 avatar */
  source?: 'avatar' | 'wallpaper';
  /** 目标分类；avatar=站内分类路径，wallpaper=站内 tag；缺省用各自默认配置 */
  categories?: string[];
  /** 每个分类最多抓取的页码；avatar 为列表页/文章页数，wallpaper 为 API 页数 */
  maxPages?: number;
  /** 每个分类最多入库的图片数 */
  maxImagesPerCategory?: number;
  /** 仅抓取该日期之后的图片（YYYY-MM-DD，头像源按图片 URL 内日期判断） */
  dateFrom?: string;
  /** 仅抓取该日期之前的图片（YYYY-MM-DD） */
  dateTo?: string;
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
  key: string;
  label: string;
}

const AVATAR_BASE = 'http://www.33990.net';
const WP_BASE = 'https://bz.sfbsh.cn';

/** 头像源默认抓取分类（排除动漫/卡通等 IP 敏感分类） */
const AVATAR_DEFAULT: TargetCategory[] = [
  { key: 'weixintouxiang', label: '微信头像' },
  { key: 'nanshengtouxiang', label: '男生头像' },
  { key: 'nvshengtouxiang', label: '女生头像' },
  { key: 'douyintouxiang', label: '抖音头像' },
];

/** 壁纸源默认 tag（排除“动漫”等 IP 敏感分类） */
const WP_DEFAULT: string[] = ['暗黑', '抽象', '简约', '可爱', '文字', '艺术', '苹果'];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

@Injectable()
export class CrawlerService {
  private readonly logger = new Logger('Crawler');
  /** 防止定时任务/手动任务重复并发 */
  private running = false;

  constructor(private readonly materials: MaterialsService) {}

  /** 每日凌晨 4 点自动抓取（默认头像源；增量去重） */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'crawler_daily' })
  async daily() {
    this.logger.log('[Crawler] 每日定时抓取开始');
    try {
      await this.run({});
    } catch (e) {
      this.logger.error(`[Crawler] 定时抓取失败: ${(e as Error).message}`);
    }
  }

  isRunning() {
    return this.running;
  }

  /** 入口：按 source 分发 */
  async run(options: CrawlOptions = {}): Promise<CrawlResult> {
    if (this.running) throw new Error('抓取任务正在进行中，请稍后再试');
    this.running = true;
    try {
      return options.source === 'wallpaper'
        ? await this.runWallpaper(options)
        : await this.runAvatar(options);
    } finally {
      this.running = false;
    }
  }

  /* ============================ 头像源 ============================ */

  private async runAvatar(options: CrawlOptions): Promise<CrawlResult> {
    const maxPages = Math.min(Math.max(options.maxPages ?? 2, 1), 50);
    const maxImg = Math.min(options.maxImagesPerCategory ?? 40, 1000);
    const delayMs = Math.max(options.delayMs ?? 400, 100);
    const targets: TargetCategory[] = options.categories?.length
      ? options.categories.map((p) => ({ key: p, label: p }))
      : AVATAR_DEFAULT;

    const data = this.materials.getData();
    const newCategories: string[] = [];

    for (const t of targets) {
      const key = `avatar_${t.key}`;
      if (!data.categories.some((c) => c.key === key)) {
        data.categories.push({ key, label: t.label || key, icon: '' });
        newCategories.push(key);
      }
    }

    const result: CrawlResult = { created: 0, skipped: 0, errors: 0, newCategories, detail: {} };

    for (const t of targets) {
      const key = `avatar_${t.key}`;
      const urls = new Set<string>();
      await this.collectAvatarImages(t.key, maxPages, urls, delayMs);
      const filtered = [...urls]
        .filter((u) => this.inDateRange(u, options.dateFrom, options.dateTo))
        .slice(0, maxImg);
      const d = await this.downloadAvatar(key, t.label || key, filtered, delayMs, data);
      result.created += d.created;
      result.skipped += d.skipped;
      result.errors += d.errors;
      result.detail[key] = d;
    }

    if (result.created > 0) this.materials.saveData(data);
    this.logCrawled('头像', result);
    return result;
  }

  private async collectAvatarImages(
    catePath: string,
    maxPages: number,
    out: Set<string>,
    delayMs: number,
  ): Promise<void> {
    // 1) 分类列表页（含缩略图，通常即原图）
    for (let page = 1; page <= maxPages; page++) {
      const cateUrl = page === 1 ? `${AVATAR_BASE}/${catePath}` : `${AVATAR_BASE}/${catePath}/${page}`;
      try {
        const html = await this.fetchText(cateUrl, AVATAR_BASE);
        const $ = cheerio.load(html);
        $('img').each((_, el) => {
          const src = $(el).attr('src') || $(el).attr('data-src') || '';
          if (src && /img\.5km\.net/.test(src)) out.add(this.abs(src, AVATAR_BASE));
        });
        await this.sleep(delayMs);
      } catch {
        if (page > 1) break;
      }
    }
    // 2) 前 2 页文章详情页补充正文大图（去重）
    const artLinks = new Set<string>();
    for (let page = 1; page <= Math.min(maxPages, 2); page++) {
      const cateUrl = page === 1 ? `${AVATAR_BASE}/${catePath}` : `${AVATAR_BASE}/${catePath}/${page}`;
      try {
        const html = await this.fetchText(cateUrl, AVATAR_BASE);
        const $ = cheerio.load(html);
        $('a[href*="/s/"]').each((_, el) => {
          const m = ($(el).attr('href') || '').match(/\/s\/\d+\.html/);
          if (m) artLinks.add(`${AVATAR_BASE}${m[0]}`);
        });
        await this.sleep(delayMs);
      } catch {
        break;
      }
    }
    let n = 0;
    for (const artUrl of artLinks) {
      if (n++ > 60) break;
      try {
        const html = await this.fetchText(artUrl, AVATAR_BASE);
        const $ = cheerio.load(html);
        $('img').each((_, el) => {
          const src = $(el).attr('src') || $(el).attr('data-src') || '';
          if (src && /img\.5km\.net/.test(src)) out.add(this.abs(src, AVATAR_BASE));
        });
        await this.sleep(delayMs);
      } catch {
        /* 单篇失败忽略 */
      }
    }
  }

  private async downloadAvatar(
    categoryKey: string,
    categoryLabel: string,
    urls: string[],
    delayMs: number,
    data: { materials: MaterialItem[] },
  ): Promise<{ created: number; skipped: number; errors: number }> {
    let created = 0;
    let skipped = 0;
    let errors = 0;
    const existing = new Set(data.materials.map((m) => m.url));
    const dir = path.join(process.cwd(), 'public', 'materials', 'avatar');
    fs.mkdirSync(dir, { recursive: true });

    for (const url of urls) {
      const localUrl = `/static/materials/avatar/${this.fileNameFor(url)}`;
      if (existing.has(localUrl)) {
        skipped++;
        await this.sleep(delayMs);
        continue;
      }
      try {
        const buf = await this.fetchBytes(url, AVATAR_BASE);
        fs.writeFileSync(path.join(dir, this.fileNameFor(url)), buf);
      } catch {
        errors++;
        await this.sleep(delayMs);
        continue;
      }
      const hash = createHash('sha1').update(url).digest('hex').slice(0, 10);
      data.materials.unshift({
        id: `cz_${hash}`,
        title: `${categoryLabel} ${created + 1}`,
        category: categoryKey,
        url: localUrl,
        thumbUrl: localUrl,
        width: 1024,
        height: 1024,
        tags: [categoryLabel, '头像', '抓取'],
        type: 'avatar',
      });
      created++;
      existing.add(localUrl);
      await this.sleep(delayMs);
    }
    return { created, skipped, errors };
  }

  /* ============================ 壁纸源 ============================ */

  private async runWallpaper(options: CrawlOptions): Promise<CrawlResult> {
    const maxPages = Math.min(Math.max(options.maxPages ?? 10, 1), 50);
    const maxImg = Math.min(options.maxImagesPerCategory ?? 60, 1000);
    const delayMs = Math.max(options.delayMs ?? 300, 100);
    const targets: string[] = options.categories?.length ? options.categories : WP_DEFAULT;

    const data = this.materials.getData();
    const newCategories: string[] = [];
    for (const t of targets) {
      const key = `wallpaper_${this.slug(t)}`;
      if (!data.categories.some((c) => c.key === key)) {
        data.categories.push({ key, label: t, icon: '' });
        newCategories.push(key);
      }
    }

    const result: CrawlResult = { created: 0, skipped: 0, errors: 0, newCategories, detail: {} };

    for (const tag of targets) {
      const key = `wallpaper_${this.slug(tag)}`;
      const d = await this.downloadWallpaper(tag, key, maxPages, maxImg, delayMs, data);
      result.created += d.created;
      result.skipped += d.skipped;
      result.errors += d.errors;
      result.detail[key] = d;
    }

    if (result.created > 0) this.materials.saveData(data);
    this.logCrawled('壁纸', result);
    return result;
  }

  private async downloadWallpaper(
    tag: string,
    catKey: string,
    maxPages: number,
    maxImg: number,
    delayMs: number,
    data: { materials: MaterialItem[] },
  ): Promise<{ created: number; skipped: number; errors: number }> {
    let created = 0;
    let skipped = 0;
    let errors = 0;
    const dir = path.join(process.cwd(), 'public', 'materials', 'wallpaper');
    fs.mkdirSync(dir, { recursive: true });

    for (let page = 1; page <= maxPages; page++) {
      if (created + skipped >= maxImg && created >= maxImg) break;
      let items: any[] = [];
      try {
        const url = `${WP_BASE}/api/wallpapers.php?page=${page}&limit=100&tag=${encodeURIComponent(tag)}`;
        const json = await this.fetchJson(url, WP_BASE);
        items = json?.data || [];
      } catch {
        break; // 无更多页
      }
      if (items.length === 0) break;

      for (const it of items) {
        if (created >= maxImg) break;
        const id = `wp_${it.id}`;
        if (data.materials.some((m) => m.id === id)) {
          skipped++;
          continue;
        }
        const filename = it.filename || '';
        const ext = (filename.split('.').pop() || 'webp').replace(/[^a-zA-Z0-9]/g, '');
        const lname = `wp_${it.id}.${ext}`;
        const tname = `wp_${it.id}_thumb.${ext}`;
        const okL = await this.downloadToDir(
          `${WP_BASE}/wallpapers/large/${filename}`,
          path.join(dir, lname),
          WP_BASE,
        );
        const okT = okL
          ? await this.downloadToDir(`${WP_BASE}/wallpapers/thumbnail/${filename}`, path.join(dir, tname), WP_BASE)
          : false;
        if (!okL && !okT) {
          errors++;
          continue;
        }
        data.materials.unshift({
          id,
          title: it.title || tag,
          category: catKey,
          url: `/static/materials/wallpaper/${okL ? lname : tname}`,
          thumbUrl: `/static/materials/wallpaper/${okT ? tname : okL ? lname : tname}`,
          width: 1080,
          height: 1920,
          tags: [tag, '壁纸', '抓取'],
          type: 'wallpaper',
        });
        created++;
        await this.sleep(delayMs);
      }
      await this.sleep(delayMs * 2); // 分页间放慢
    }
    return { created, skipped, errors };
  }

  /* ============================ 工具方法 ============================ */

  private async downloadToDir(url: string, absPath: string, referer: string): Promise<boolean> {
    try {
      const buf = await this.fetchBytes(url, referer);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, buf);
      return true;
    } catch (e) {
      this.logger.warn(`[Crawler] 图片下载失败 ${url}: ${(e as Error).message}`);
      return false;
    }
  }

  private slug(s: string): string {
    return s.trim().replace(/\s+/g, '-');
  }

  /** 判断图片 URL 内的日期(YYYYMMDD)是否落在 [dateFrom, dateTo]；无法判断则放行 */
  private inDateRange(url: string, dateFrom?: string, dateTo?: string): boolean {
    if (!dateFrom && !dateTo) return true;
    const m = url.match(/((?:19\d{2}|20\d{2})(?:\d{2})(?:\d{2}))/);
    if (!m) return true;
    const d = +m[1];
    if (dateFrom) {
      const f = +dateFrom.replace(/[-/]/g, '');
      if (d < f) return false;
    }
    if (dateTo) {
      const t = +dateTo.replace(/[-/]/g, '');
      if (d > t) return false;
    }
    return true;
  }

  private fileNameFor(url: string): string {
    const base = (url.split('/').pop() || '').split('?')[0].replace(/[^a-zA-Z0-9._-]/g, '_');
    return base || `img_${createHash('sha1').update(url).digest('hex').slice(0, 10)}.jpg`;
  }

  private abs(src: string, base: string): string {
    if (!src.startsWith('http')) return `${base}${src.startsWith('/') ? '' : '/'}${src}`;
    return src.replace(/^https?:/i, 'http:');
  }

  private async fetchText(url: string, referer: string): Promise<string> {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  private async fetchJson(url: string, referer: string): Promise<any> {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  private async fetchBytes(url: string, referer: string): Promise<Buffer> {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: referer } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private logCrawled(name: string, r: CrawlResult) {
    this.logger.log(
      `[Crawler] ${name}抓取完成：新增 ${r.created}，跳过 ${r.skipped}，失败 ${r.errors}，新分类 ${JSON.stringify(r.newCategories)}`,
    );
  }
}