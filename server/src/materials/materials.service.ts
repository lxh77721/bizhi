import { Injectable, OnModuleInit } from '@nestjs/common';
import { FileStore } from '@/common/file-store.service';
import { createHash } from 'crypto';
import { MATERIALS, CATEGORIES, MaterialItem, Category } from '@/materials/materials.data';
import { composeUniqueTitle, isTitleMeaningless } from '@/crawler/sources/title';

export interface QueryMaterialDto {
  category?: string;
  keyword?: string;
  /** 类型过滤：avatar=头像 / wallpaper=壁纸，缺省返回全部 */
  type?: 'avatar' | 'wallpaper';
}

export interface MaterialsFile {
  categories: Category[];
  materials: MaterialItem[];
}

@Injectable()
export class MaterialsService implements OnModuleInit {
  /** 内存缓存：启动时从 data/materials.json 加载，首次用种子数据初始化并写盘 */
  private cache: MaterialsFile;

  constructor(private readonly store: FileStore) {}

  onModuleInit() {
    this.reload();
  }

  /** 从 data/materials.json 重载（素材/分类被后台修改后热生效） */
  reload() {
    const seed: MaterialsFile = { categories: CATEGORIES, materials: MATERIALS };
    this.cache = this.store.read('materials.json', seed);
    console.log(
      `[Materials] 已加载 ${this.cache.materials.length} 条素材 / ${this.cache.categories.length} 个分类`,
    );
  }

  private current(): MaterialsFile {
    if (!this.cache) this.reload();
    this.ensureCodes();
    return this.cache;
  }

  /** 查询素材列表（分类 + 关键词） */
  queryList(query: QueryMaterialDto): { list: MaterialItem[]; categories: Category[] } {
    const { materials, categories } = this.current();
    let result: MaterialItem[] = materials;

    if (query.category && query.category !== 'all') {
      result = result.filter((item) => item.category === query.category);
    }

    if (query.type === 'avatar') {
      result = result.filter((item) => item.type !== 'wallpaper');
    } else if (query.type === 'wallpaper') {
      result = result.filter((item) => item.type === 'wallpaper');
    }

    if (query.keyword && query.keyword.trim()) {
      const kw = query.keyword.trim().toLowerCase();
      result = result.filter((item) => {
        const haystack = [item.title, item.category, ...(item.tags || [])].join(' ').toLowerCase();
        return haystack.includes(kw);
      });
    }

    return { list: result, categories };
  }

  /** 按 id 查找单个素材 */
  findById(id: string): MaterialItem | undefined {
    return this.current().materials.find((item) => item.id === id);
  }

  /** 按 8 位口令取图码查找素材 */
  findByCode(code: string): MaterialItem | undefined {
    this.ensureCodes();
    return this.cache.materials.find((item) => item.code === code);
  }

  /** 确保每条素材都有稳定的 8 位口令码（由 id 派生、幂等；首次为历史素材补齐并落盘） */
  private ensureCodes() {
    const { materials } = this.cache;
    const used = new Set<string>();
    let changed = false;
    for (const m of materials) {
      if (m.code && !used.has(m.code)) {
        used.add(m.code);
        continue;
      }
      // 无 code 或 code 冲突 → 重新生成
      let c = this.genCode(m.id);
      let guard = 0;
      while (used.has(c) && guard++ < 30) c = this.genCode(c);
      m.code = c;
      used.add(c);
      changed = true;
    }
    if (changed) this.store.write('materials.json', this.cache);
  }

  /** 由种子串生成 8 位口令码（base36，字母数字） */
  private genCode(seed: string): string {
    const hex = createHash('md5').update(seed).digest('hex');
    const num = BigInt('0x' + hex.slice(0, 11)); // 44 bit
    return num.toString(36).padStart(8, '0').slice(-8)
  }

  /* -------------------- 管理端读写（admin 模块调用） -------------------- */

  getData(): MaterialsFile {
    return this.current();
  }

  /** 整体保存（分类 + 素材）并更新内存缓存 */
  saveData(data: MaterialsFile) {
    this.cache = data;
    this.store.write('materials.json', data);
  }

  /* ---------------- 傻瓜式分类维护（仅名字 + 类型） ---------------- */

  /** 新增分类：仅需名字，类型默认头像；自动生成 key，返回新分类 */
  addCategory(label: string, type: 'avatar' | 'wallpaper' = 'avatar'): Category {
    this.current();
    const name = label.trim();
    if (!name) throw new Error('请填写分类名字');
    // 同名分类（同类型）直接返回，不重复建
    const existed = this.cache.categories.find(
      (c) => c.label === name && (c.type || 'avatar') === type,
    );
    if (existed) return existed;
    const key = this.uniqueKey(this.slug(name), type);
    const cat: Category = { key, label: name, type };
    this.cache.categories.push(cat);
    this.store.write('materials.json', this.cache);
    return cat;
  }

  /** 删除分类；若该分类下仍有素材则拒绝，避免产生孤儿图片 */
  removeCategory(key: string): void {
    this.current();
    const inUse = this.cache.materials.some((m) => m.category === key);
    if (inUse) throw new Error('该分类下还有图片，请先删除图片');
    const before = this.cache.categories.length;
    this.cache.categories = this.cache.categories.filter((c) => c.key !== key);
    if (this.cache.categories.length === before) throw new Error('分类不存在');
    this.store.write('materials.json', this.cache);
  }

  /** 分类列表（可按类型） */
  listCategories(type?: 'avatar' | 'wallpaper'): Category[] {
    const cats = this.current().categories;
    return type ? cats.filter((c) => (c.type || 'avatar') === type) : cats;
  }

  /* ---------------- 傻瓜式图片创建（选分类 + 图片） ---------------- */

  /** 用已上传好的图片 URL 创建素材：只需分类 key + 图片 URL，其余字段自动补全 */
  createFromUpload(categoryKey: string, url: string): MaterialItem {
    this.current();
    if (!url) throw new Error('图片地址为空');
    const category = this.cache.categories.find((c) => c.key === categoryKey);
    if (!category) throw new Error('请选择分类');
    const file = url.split('/').pop() || '';
    const id = this.uniqueMaterialId('m_' + Date.now().toString(36));
    const item: MaterialItem = {
      id,
      title: category.label, // 标题默认取分类名，列表已不展示标题
      category: category.key,
      url,
      thumbUrl: url,
      width: 1024,
      height: 1024,
      tags: [category.label],
      type: category.type || 'avatar',
      code: '',
    };
    void file;
    this.cache.materials.push(item);
    this.ensureCodes(); // 立刻补 8 位口令码并落盘
    return item;
  }

  /** 删除单张素材 */
  removeMaterial(id: string): void {
    this.current();
    const before = this.cache.materials.length;
    this.cache.materials = this.cache.materials.filter((m) => m.id !== id);
    if (this.cache.materials.length === before) throw new Error('图片不存在');
    this.store.write('materials.json', this.cache);
  }

  /* ---------------------- 存量素材标题回填 ---------------------- */

  /**
   * 重写「无区分度」的存量标题（幂等：只改 title / tags，不动 id / url / category）
   * --------------------------------------------------------------------------
   * 早期爬虫直接把分类名当标题。实测存量 168 张素材只有 25 个不同标题：
   *   147 张集中在 4 个分类名上（「女生头像」40 张、「微信头像」39 张…），
   *   另 15 张是源站图片 ID（如 G03j1HrWUAAYHiz）。
   * 微信搜一搜按页面判重，标题相同的详情页互相覆盖，绝大部分拿不到收录；
   * 标题是乱码 ID 的页面即使被收录，也没有任何用户会搜的词能命中。
   *
   * 本方法可反复执行：已经有区分度的标题原样保留，不会被改来改去。
   * 走的是与抓取完全相同的 composeUniqueTitle，新老素材标题规则一致。
   */
  retitleExisting(): {
    total: number;
    changed: number;
    tagsFixed: number;
    kept: number;
    uniqueBefore: number;
    uniqueAfter: number;
    samples: Array<{ id: string; before: string; after: string }>;
  } {
    this.current();
    const { materials, categories } = this.cache;
    const labelOf = new Map(categories.map((c) => [c.key, c.label]));
    const typeOf = new Map(
      categories.map((c) => [c.key, (c.type || 'avatar') as 'avatar' | 'wallpaper']),
    );

    const uniqueBefore = new Set(materials.map((m) => m.title)).size;

    // 已有区分度的标题先占位：回填结果不得与之撞车，否则只是把重复挪了个位置
    const used = new Set<string>();
    const pending: MaterialItem[] = [];
    for (const m of materials) {
      const label = labelOf.get(m.category) || m.category;
      if (isTitleMeaningless(m.title, label)) pending.push(m);
      else used.add(m.title);
    }

    const samples: Array<{ id: string; before: string; after: string }> = [];
    let changed = 0;
    for (const m of pending) {
      const label = labelOf.get(m.category) || m.category;
      const type = typeOf.get(m.category) || 'avatar';
      const next = composeUniqueTitle({ label, type, sid: m.id, keyword: label }, used);
      used.add(next);
      if (m.title === next) continue;
      if (samples.length < 8) samples.push({ id: m.id, before: m.title, after: next });
      m.title = next;
      changed++;
    }

    // tags 规整：不限于标题被改的素材。详情页会把 tags 渲染成标签胶囊，
    // 首项与标题保持一致，页面上的文本才和标题对得上
    let tagsFixed = 0;
    for (const m of materials) {
      const label = labelOf.get(m.category) || m.category;
      const want = Array.from(new Set([m.title, label])).slice(0, 4);
      if (JSON.stringify(want) !== JSON.stringify(m.tags || [])) {
        m.tags = want;
        tagsFixed++;
      }
    }

    if (changed || tagsFixed) this.store.write('materials.json', this.cache);

    return {
      total: materials.length,
      changed,
      tagsFixed,
      kept: materials.length - pending.length,
      uniqueBefore,
      uniqueAfter: new Set(materials.map((m) => m.title)).size,
      samples,
    };
  }

  /* ------------------------------- 工具 ------------------------------- */

  /** 中文名转拼音不现实，这里用类型前缀 + 序号生成稳定 key */
  private uniqueKey(base: string, type: 'avatar' | 'wallpaper'): string {
    const prefix = (type === 'wallpaper' ? 'wp_' : 'av_') + (base || 'cat');
    let key = prefix;
    let i = 1;
    const keys = new Set(this.cache.categories.map((c) => c.key));
    while (keys.has(key)) key = `${prefix}_${i++}`;
    return key;
  }

  private uniqueMaterialId(base: string): string {
    let id = base;
    let i = 1;
    const ids = new Set(this.cache.materials.map((m) => m.id));
    while (ids.has(id)) id = `${base}_${i++}`;
    return id;
  }

  /** 简单 slug：保留字母数字，中文等退化为空（key 走前缀+序号） */
  private slug(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 12);
  }
}