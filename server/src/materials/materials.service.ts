import { Injectable } from '@nestjs/common';
import { MATERIALS, CATEGORIES, MaterialItem } from '@/materials/materials.data';

export interface QueryMaterialDto {
  category?: string;
  keyword?: string;
}

@Injectable()
export class MaterialsService {
  /** 查询素材列表（支持按分类 + 关键词搜索） */
  queryList(query: QueryMaterialDto): { list: MaterialItem[]; categories: { key: string; label: string }[] } {
    let list: MaterialItem[] = MATERIALS;

    if (query.category && query.category !== 'all') {
      list = list.filter((item) => item.category === query.category);
    }

    if (query.keyword && query.keyword.trim()) {
      const kw = query.keyword.trim().toLowerCase();
      list = list.filter((item) => {
        const haystack = [item.title, item.category, ...item.tags].join(' ').toLowerCase();
        return haystack.includes(kw);
      });
    }

    return { list, categories: CATEGORIES };
  }

  /** 按 id 查找单个素材 */
  findById(id: string): MaterialItem | undefined {
    return MATERIALS.find((item) => item.id === id);
  }
}