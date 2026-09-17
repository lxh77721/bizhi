import { Injectable, OnModuleInit } from '@nestjs/common';
import { FileStore } from '@/common/file-store.service';
import { MATERIALS, CATEGORIES, MaterialItem, Category } from '@/materials/materials.data';

export interface QueryMaterialDto {
  category?: string;
  keyword?: string;
}

interface MaterialsFile {
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
    return this.cache;
  }

  /** 查询素材列表（分类 + 关键词） */
  queryList(query: QueryMaterialDto): { list: MaterialItem[]; categories: Category[] } {
    const { materials, categories } = this.current();
    let result: MaterialItem[] = materials;

    if (query.category && query.category !== 'all') {
      result = result.filter((item) => item.category === query.category);
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