/**
 * 素材库数据文件（后台素材库）
 * --------------------------------------------------------------------------
 * 这里的数据即首页展示的素材。目前为 8 张由 AI 生成的原创图片（插画/风景/文字），
 * 图片已保存到本地物理目录：server/public/materials/ 下，通过 /static 路径访问，
 * 无需对象存储/TOS，也无需额外数据库。
 *
 * 【如何添加/替换素材】（仅需两步，不改代码）
 *   1. 把你从 CC0 商用图库下载的图片放到 server/public/materials/ 目录下
 *      （建议缩略图另存一份 _thumb 后缀，尺寸更小利于首页加载）。
 *   2. 在下方 MATERIALS 数组按格式追加一条，url 写原图、thumbUrl 写缩略图：
 *        url: '/static/materials/你的图片名.jpg'
 *        thumbUrl: '/static/materials/你的图片名-thumb.jpg'
 *   保存后热更新自动生效，首页刷新即可看到。
 *
 * 分类(category)可选值：
 *   girl      女生头像
 *   boy       男生头像
 *   couple    情侣头像
 *   landscape 治愈风景壁纸
 *   text      极简文字壁纸
 *
 * 字段说明：
 *   id       唯一标识（字母-数字，方便维护）
 *   title    素材名称（用于搜一搜关键词与分享文案）
 *   category 分类
 *   url      原图地址（用于“保存无水印原图”）
 *   thumbUrl 缩略图地址（瀑布流/预览使用）
 *   width/height 展示宽高比（用于瀑布流错落布局，不改变图片本身）
 *   tags     标签（扩充关键词搜索命中）
 * --------------------------------------------------------------------------
 */
export interface MaterialItem {
  id: string;
  title: string;
  /** 分类 key（对应 CATEGORIES，后台可动态新增分类） */
  category: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  tags: string[];
  /** 素材类型：avatar=头像（来自大头像站）、wallpaper=壁纸（来自壁纸站）；缺省视为头像 */
  type?: 'avatar' | 'wallpaper';
}

/** 首页分类（key 对应素材 category，label 为展示名，icon 为可选图标名） */
export interface Category {
  key: string;
  label: string;
  icon?: string;
}

/** 首页分类导航标签（种子数据，可被后台动态修改并写回 data 文件） */
export const CATEGORIES: Category[] = [
  { key: 'girl', label: '女生头像', icon: 'Sparkles' },
  { key: 'boy', label: '男生头像', icon: 'Sun' },
  { key: 'couple', label: '情侣头像', icon: 'Heart' },
  { key: 'landscape', label: '治愈风景壁纸', icon: 'Mountain' },
  { key: 'text', label: '极简文字壁纸', icon: 'PenLine' },
];

export const MATERIALS: MaterialItem[] = [
  {
    id: 'girl-01',
    title: '樱花治愈女生头像',
    category: 'girl',
    url: '/static/materials/girl-01.jpg',
    thumbUrl: '/static/materials/girl-01-thumb.jpg',
    width: 1024,
    height: 1280,
    tags: ['女生头像', '治愈', '樱花', '日系', '头像'],
  },
  {
    id: 'girl-02',
    title: '花语清新女生头像',
    category: 'girl',
    url: '/static/materials/girl-02.jpg',
    thumbUrl: '/static/materials/girl-02-thumb.jpg',
    width: 1024,
    height: 1024,
    tags: ['女生头像', '清新', '花朵', '自然', '头像'],
  },
  {
    id: 'boy-01',
    title: '晴空治愈男生头像',
    category: 'boy',
    url: '/static/materials/boy-01.jpg',
    thumbUrl: '/static/materials/boy-01-thumb.jpg',
    width: 1024,
    height: 820,
    tags: ['男生头像', '晴空', '蓝色', '治愈', '头像'],
  },
  {
    id: 'couple-01',
    title: '暖阳浪漫情侣头像',
    category: 'couple',
    url: '/static/materials/couple-01.jpg',
    thumbUrl: '/static/materials/couple-01-thumb.jpg',
    width: 1024,
    height: 1280,
    tags: ['情侣头像', '浪漫', '温暖', '甜蜜', '头像'],
  },
  {
    id: 'landscape-01',
    title: '雪山晨光治愈壁纸',
    category: 'landscape',
    url: '/static/materials/landscape-01.jpg',
    thumbUrl: '/static/materials/landscape-01-thumb.jpg',
    width: 1440,
    height: 1150,
    tags: ['风景壁纸', '雪山', '湖泊', '晨光', '手机壁纸', '治愈壁纸'],
  },
  {
    id: 'landscape-02',
    title: '落日海岛氛围壁纸',
    category: 'landscape',
    url: '/static/materials/landscape-02.jpg',
    thumbUrl: '/static/materials/landscape-02-thumb.jpg',
    width: 1280,
    height: 1700,
    tags: ['风景壁纸', '落日', '海岛', '氛围', '手机壁纸', '治愈壁纸'],
  },
  {
    id: 'text-01',
    title: '越来越好极简文字壁纸',
    category: 'text',
    url: '/static/materials/text-01.jpg',
    thumbUrl: '/static/materials/text-01-thumb.jpg',
    width: 1024,
    height: 1440,
    tags: ['极简壁纸', '文字壁纸', '励志', '治愈', '手机壁纸'],
  },
  {
    id: 'text-02',
    title: '今天也要开心文字壁纸',
    category: 'text',
    url: '/static/materials/text-02.jpg',
    thumbUrl: '/static/materials/text-02-thumb.jpg',
    width: 1024,
    height: 1024,
    tags: ['极简壁纸', '文字壁纸', '开心', '治愈', '手机壁纸'],
  },
]