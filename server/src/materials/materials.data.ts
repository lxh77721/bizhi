/**
 * 素材库数据文件
 * --------------------------------------------------------------------------
 * 说明：这里是「后台素材库」的数据来源。您后续手动上传 CC0 图片后，把图片的
 * 对象存储(TOS) URL 填到下面的 url 与 thumbUrl 即可，无需改代码。
 *
 * 分类(category)可选值：
 *   girl      女生头像
 *   boy       男生头像
 *   couple    情侣头像
 *   landscape 治愈风景壁纸
 *   text      极简文字壁纸
 *
 * 字段说明：
 *   id       唯一标识（字符串，方便维护）
 *   title    素材名称（用于搜一搜关键词与分享文案）
 *   category 分类
 *   url      原图地址（用于“保存无水印原图”）
 *   thumbUrl 缩略图地址（瀑布流/预览使用，体积更小）
 *   width/height 原图宽高（用于瀑布流错落布局的比例）
 *   tags     标签（扩充搜索命中）
 *
 * 注意：下方示例图片来自公开 CDN，仅用于开发预览。正式发布前请替换为您
 *       自己上传到对象存储的 CC0 商用图片 URL。
 * --------------------------------------------------------------------------
 */
export interface MaterialItem {
  id: string;
  title: string;
  category: 'girl' | 'boy' | 'couple' | 'landscape' | 'text';
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  tags: string[];
}

export const MATERIALS: MaterialItem[] = [
  {
    id: 'girl-01',
    title: '温柔日系女生头像',
    category: 'girl',
    url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=1600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=500&q=80',
    width: 800,
    height: 1000,
    tags: ['女生头像', '日系', '温柔', '头像'],
  },
  {
    id: 'girl-02',
    title: '清新自然女生头像',
    category: 'girl',
    url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=1600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=500&q=80',
    width: 900,
    height: 900,
    tags: ['女生头像', '清新', '自然', '头像'],
  },
  {
    id: 'boy-01',
    title: '阳光干净男生头像',
    category: 'boy',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&q=80',
    width: 800,
    height: 1000,
    tags: ['男生头像', '阳光', '干净', '头像'],
  },
  {
    id: 'boy-02',
    title: '简约欧美男生头像',
    category: 'boy',
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=1600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&q=80',
    width: 900,
    height: 900,
    tags: ['男生头像', '简约', '欧美', '头像'],
  },
  {
    id: 'couple-01',
    title: '甜蜜浪漫情侣头像',
    category: 'couple',
    url: 'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?w=1600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?w=500&q=80',
    width: 900,
    height: 1200,
    tags: ['情侣头像', '浪漫', '甜蜜', '头像'],
  },
  {
    id: 'couple-02',
    title: '温馨日常情侣头像',
    category: 'couple',
    url: 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=1600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=500&q=80',
    width: 900,
    height: 1000,
    tags: ['情侣头像', '温馨', '日常', '头像'],
  },
  {
    id: 'landscape-01',
    title: '雪山湖泊治愈壁纸',
    category: 'landscape',
    url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=500&q=80',
    width: 1200,
    height: 800,
    tags: ['风景壁纸', '雪山', '湖泊', '治愈', '手机壁纸'],
  },
  {
    id: 'landscape-02',
    title: '晨雾森林治愈壁纸',
    category: 'landscape',
    url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=500&q=80',
    width: 1200,
    height: 900,
    tags: ['风景壁纸', '森林', '晨雾', '治愈', '手机壁纸'],
  },
  {
    id: 'landscape-03',
    title: '落日海滩氛围壁纸',
    category: 'landscape',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&q=80',
    width: 1200,
    height: 1600,
    tags: ['风景壁纸', '落日', '海滩', '氛围', '手机壁纸'],
  },
  {
    id: 'text-01',
    title: '极简治愈文字壁纸',
    category: 'text',
    url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500&q=80',
    width: 900,
    height: 1600,
    tags: ['文字壁纸', '极简', '治愈', '氛围', '手机壁纸'],
  },
  {
    id: 'text-02',
    title: '极简渐变文字壁纸',
    category: 'text',
    url: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1600&q=80',
    thumbUrl: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=500&q=80',
    width: 900,
    height: 1600,
    tags: ['文字壁纸', '极简', '渐变', '氛围', '手机壁纸'],
  },
];

/** 分类导航配置（首页顶部） */
export const CATEGORIES = [
  { key: 'girl', label: '女生头像' },
  { key: 'boy', label: '男生头像' },
  { key: 'couple', label: '情侣头像' },
  { key: 'landscape', label: '治愈风景壁纸' },
  { key: 'text', label: '极简文字壁纸' },
];