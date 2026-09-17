import { Injectable, BadRequestException } from '@nestjs/common';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { MaterialsService } from '@/materials/materials.service';
import { OssService } from '@/common/oss.service';
import { MaterialItem, Category } from '@/materials/materials.data';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

export interface CrawlOptions {
  source?: 'avatar' | 'wallpaper';
  categories?: string[];
  maxPages?: number;
  maxImagesPerCategory?: number;
  dateFrom?: string;
  dateTo?: string;
}

/** 头像源可手动选择的分类（不选则同步站点全部分类） */
const DEFAULT_AVATAR_CATES: Array<{ path: string; label: string }> = [
  { path: 'weixintouxiang', label: '微信头像' },
  { path: 'nanshengtouxiang', label: '男生头像' },
  { path: 'nvshengtouxiang', label: '女生头像' },
  { path: 'douyintouxiang', label: '抖音头像' },
];
/** 头像源站点同步时需要排除的敏感分类关键词 */
const AVATAR_SKIP_LABEL = /动漫|卡通|明星|二次元|ceshi|测试/;

/**
 * 素材爬虫：从头像站+壁纸站抓取，分类与站点同步，图片上传到七牛 OSS。
 * 头像源：www.33990.net（HTML 解析，图片带日期可过滤）
 * 壁纸源：bz.sfbsh.cn（JSON API）
 */
@Injectable()
export class CrawlerService {
  private running = false;

  constructor(
    private readonly materials: MaterialsService,
    private readonly oss: OssService,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  /* ------------------------------ 通用工具 ------------------------------ */

  private async fetchText(url: string): Promise<string> {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.text();
  }

  private async fetchBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return Buffer.from(await res.arrayBuffer());
  }

  /** 把抓取的图片 buffer 存到 OSS（已配置）；未配置时回退本地 /static */
  private async storeBuffer(buf: Buffer, source: string, folder: string, fileName: string, contentType: string): Promise<string> {
    if (this.oss.isConfigured()) {
      return this.oss.upload(buf, `${source}/${folder}/${fileName}`, contentType);
    }
    const dir = path.resolve(process.cwd(), 'public', 'materials', source, folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), buf);
    return `/static/materials/${source}/${folder}/${fileName}`;
  }

  /** 追加素材（按 id 去重，写入内存并落盘） */
  private upsertMaterial(data: { categories: Category[]; materials: MaterialItem[] }, item: MaterialItem): boolean {
    if (data.materials.some((m) => m.id === item.id)) return false;
    data.materials.unshift(item);
    return true;
  }

  /** 同步某来源的分类：替换该 type 下全部本地分类为站点最新分类 */
  private syncCategories(
    data: { categories: Category[]; materials: MaterialItem[] },
    type: 'avatar' | 'wallpaper',
    cats: Array<{ key: string; label: string; icon?: string }>,
  ) {
    data.categories = data.categories.filter((c) => c.type !== type);
    for (const c of cats) {
      if (!data.categories.some((x) => x.key === c.key)) data.categories.push({ ...c, type });
    }
    this.materials.saveData(data);
    return data.categories.filter((c) => c.type === type);
  }

  /* ------------------------------ 头像源 ------------------------------ */

  /** 同步头像站分类导航（首页解析，过滤敏感分类） */
  private async fetchAvatarCategories(): Promise<Array<{ key: string; label: string }>> {
    try {
      const html = await this.fetchText('http://www.33990.net/');
      const $ = cheerio.load(html);
      const cats: Array<{ key: string; label: string }> = [];
      $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const label = $(el).text().trim();
        const m = href.match(/^\/([a-z0-9_-]+)\/?$/i) || href.match(/^\/([a-z0-9_-]+)$/i);
        if (m && label && label.length <= 8 && !AVATAR_SKIP_LABEL.test(label)) {
          const key = `avatar_${m[1]}`;
          if (!cats.some((c) => c.key === key)) cats.push({ key, label });
        }
      });
      return cats.length ? cats : DEFAULT_AVATAR_CATES.map((c) => ({ key: `avatar_${c.path}`, label: c.label }));
    } catch (e) {
      console.warn('[crawler] 头像分类同步失败，使用默认分类', e?.message);
      return DEFAULT_AVATAR_CATES.map((c) => ({ key: `avatar_${c.path}`, label: c.label }));
    }
  }

  private inDateRange(filename: string, from?: string, to?: string): boolean {
    if (!from && !to) return true;
    const m = filename.match(/([0-9]{4})([0-9]{2})([0-9]{2})/);
    const first = filename.match(/([0-9]{8})/);
    if (!first) return true; // 无日期信息不拦截
    const day = first[1];
    const ts = new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`).getTime();
    if (isNaN(ts)) return true;
    if (from) { const f = new Date(from).setHours(0,0,0,0); if (ts < f) return false; }
    if (to) { const t = new Date(to).setHours(23,59,59,999); if (ts > t) return false; }
    return true;
  }

  private async runAvatar(opts: CrawlOptions): Promise<{ created: number; skipped: number; errors: number; newCategories: number; detail?: string }> {
    const data = this.materials.getData();
    const siteCats = await this.fetchAvatarCategories();
    const synced = this.syncCategories(data, 'avatar', siteCats.map((c) => ({ ...c })));

    const selected = opts.categories && opts.categories.length
      ? synced.filter((c) => opts.categories!.includes(c.key) || opts.categories!.includes(c.key.replace('avatar_', '')))
      : synced;
    const maxPages = opts.maxPages || 3;
    const max = opts.maxImagesPerCategory || 40;

    let created = 0, skipped = 0, errors = 0;
    for (const cat of selected) {
      const pathSlug = cat.key.replace('avatar_', '');
      let got = data.materials.filter((m) => m.category === cat.key).length;
      if (got >= max) continue;
      try {
        for (let page = 1; page <= maxPages && got < max; page++) {
          const listUrl = page === 1 ? `http://www.33990.net/${pathSlug}` : `http://www.33990.net/${pathSlug}/${page}`;
          const html = await this.fetchText(listUrl);
          const $ = cheerio.load(html);
          const imgUrls = new Set<string>();
          $('img').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || '';
            if (src.includes('5km.net') && /^https?:/i.test(src)) imgUrls.add(src);
          });
          for (const imgUrl of Array.from(imgUrls)) {
            if (got >= max) break;
            const fileName = imgUrl.split('/').pop() || '';
            const ext = (fileName.split('.').pop() || 'jpg').match(/^[a-zA-Z0-9]{2,5}$/) ? fileName.split('.').pop() : 'jpg';
            if (!this.inDateRange(fileName, opts.dateFrom, opts.dateTo)) { skipped++; continue; }
            const id = `cz_${fileName.replace(/\.[a-z0-9]+$/i, '')}`;
            if (data.materials.some((m) => m.id === id)) { skipped++; continue; }
            try {
              const buf = await this.fetchBuffer(imgUrl);
              const url = await this.storeBuffer(buf, 'avatar', pathSlug, `${fileName}_${Date.now()}.${ext}`, `image/${ext === 'png' ? 'png' : 'jpeg'}`);
              this.upsertMaterial(data, {
                id, title: cat.label, category: cat.key,
                url, thumbUrl: url, width: 1024, height: 1024,
                tags: [cat.label, '头像'], type: 'avatar',
              });
              created++; got++;
              await new Promise((r) => setTimeout(r, 300));
            } catch (e) { errors++; console.warn('[crawler] 头像下载失败', imgUrl, e?.message); }
          }
        }
      } catch (e) {
        console.warn(`[crawler] 头像分类 ${cat.key} 抓取失败`, e?.message);
      }
    }
    this.materials.saveData(data);
    return { created, skipped, errors, newCategories: synced.length, detail: `头像源：新增 ${created} 张，跳过 ${skipped}，失败 ${errors}` };
  }

  /* ------------------------------ 壁纸源 ------------------------------ */

  private async runWallpaper(opts: CrawlOptions): Promise<{ created: number; skipped: number; errors: number; newCategories: number; detail?: string }> {
    const data = this.materials.getData();
    const base = 'https://bz.sfbsh.cn';
    // 同步壁纸站分类（tags）
    let siteTags: string[] = [];
    try {
      siteTags = JSON.parse(await this.fetchText(`${base}/api/get_tags.php`)) || [];
    } catch (e) {
      console.warn('[crawler] 壁纸站分类同步失败', e?.message);
      siteTags = ['简约', '艺术', '风景', '文字'];
    }
    const cats = siteTags.filter((t) => t && !AVATAR_SKIP_LABEL.test(t)).map((t) => ({ key: `wallpaper_${t}`, label: t }));
    const synced = this.syncCategories(data, 'wallpaper', cats);

    const selected = opts.categories && opts.categories.length
      ? synced.filter((c) => opts.categories!.includes(c.key) || opts.categories!.includes(c.key.replace('wallpaper_', '')))
      : synced;
    const maxPages = opts.maxPages || 8;
    const max = opts.maxImagesPerCategory || 40;

    let created = 0, skipped = 0, errors = 0;
    for (const cat of selected) {
      const tag = cat.key.replace('wallpaper_', '');
      let got = data.materials.filter((m) => m.category === cat.key).length;
      if (got >= max) continue;
      try {
        for (let page = 1; page <= maxPages && got < max; page++) {
          const api = `${base}/api/wallpapers.php?page=${page}&limit=100${tag ? `&tag=${encodeURIComponent(tag)}` : ''}`;
          const json = JSON.parse(await this.fetchText(api));
          const items = json?.data || [];
          if (!items.length) break;
          for (const it of items) {
            if (got >= max) break;
            const id = `wp_${it.id}`;
            if (data.materials.some((m) => m.id === id)) { skipped++; continue; }
            try {
              const fileName = it.filename || String(it.id);
              const large = `${base}/wallpapers/large/${fileName}`;
              const buf = await this.fetchBuffer(large);
              const url = await this.storeBuffer(buf, 'wallpaper', tag, `${it.id}.webp`, 'image/webp');
              this.upsertMaterial(data, {
                id, title: it.title || cat.label, category: cat.key,
                url, thumbUrl: url, width: 1080, height: 1920,
                tags: [cat.label, '壁纸', ...(it.tags || [])].slice(0, 6), type: 'wallpaper',
              });
              created++; got++;
              await new Promise((r) => setTimeout(r, 200));
            } catch (e) { errors++; console.warn('[crawler] 壁纸下载失败', it.id, e?.message); }
          }
        }
      } catch (e) {
        console.warn(`[crawler] 壁纸分类 ${cat.key} 抓取失败`, e?.message);
      }
    }
    this.materials.saveData(data);
    return { created, skipped, errors, newCategories: synced.length, detail: `壁纸源：新增 ${created} 张，跳过 ${skipped}，失败 ${errors}` };
  }

  /* ------------------------------ 对外入口 ------------------------------ */

  async run(opts: CrawlOptions = {}) {
    if (this.running) throw new BadRequestException('已有抓取任务进行中');
    this.running = true;
    try {
      const source = opts.source === 'wallpaper' ? 'wallpaper' : 'avatar';
      const res = source === 'wallpaper' ? await this.runWallpaper(opts) : await this.runAvatar(opts);
      return res;
    } finally {
      this.running = false;
    }
  }
}