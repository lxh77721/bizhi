import { Injectable, OnModuleInit } from '@nestjs/common';
import { FileStore } from '@/common/file-store.service';
import { createHash } from 'crypto';
import { MATERIALS, CATEGORIES, MaterialItem, Category } from '@/materials/materials.data';

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
}