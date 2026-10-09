/**
 * 素材标题生成器
 * --------------------------------------------------------------------------
 * 国内图站（堆糖、360、彼岸…）几乎都把**分类词**直接当标题返回，
 * 例如整个「女生头像」分类 1000 张图标题全叫「女生头像」。
 * 若原样入库，会造成：
 *   · 详情页标题几乎一模一样 → 微信搜一搜判重、权重分散
 *   · 分享卡片、瀑布流文案无差异 → 点击率低
 *   · 存量数据实测：168 张素材只有 25 个不同标题
 *
 * 因此按三级回退生成标题：
 *   1) 源站真标题（如彼岸图网 alt="凡人修仙传 梅凝 微笑 玫瑰花 4K手机壁纸高清全屏"）
 *   2) 源站标签（如 360 壁纸的 utag="海洋天堂 日出东方 松树 海岛"）
 *   3) 「形容词 + 分类 + 后缀」确定性组合（用 sid 做哈希 → 同一张图标题稳定）
 *
 * `attempt` 用于服务层检测到同分类内标题重复时重投一次骰子。
 */

import { MediaType } from './types';

/** 风格形容词池（口语化、贴近用户搜索习惯，不是硬堆关键词）
 *  数量刻意留足 —— 池子太小会导致同分类大量标题撞车，
 *  而「同分类内标题撞车」正是存量数据 168 张图只有 25 个标题的根因。 */
const ADJECTIVES = [
  '温柔',
  '清冷',
  '高级感',
  '氛围感',
  '小众',
  '超甜',
  '治愈',
  '复古',
  '甜酷',
  '元气',
  '软萌',
  '极简',
  '慵懒',
  '明艳',
  '纯欲',
  '港风',
  '轻熟',
  '少女感',
  '邻家',
  '文艺',
  '微醺',
  '胶片',
  '夏日',
  '落日',
  '清透',
  '奶油',
  '雾感',
  '低饱和',
  '森系',
  '海盐',
  '心动',
  '惬意',
  '安静',
  '星空',
  '玻璃感',
  '油画',
  '手写',
  '慢时光',
  '松弛感',
  '清欢',
];

const SUFFIX: Record<MediaType, string> = {
  avatar: '头像',
  wallpaper: '壁纸',
};

/** 已经自带这些尾巴的词，不再重复追加后缀（否则会出现「微信头像头像」） */
const GENERIC_TAILS = ['头像', '壁纸', '图片', '素材', '大全'];

/** 标题里出现这些词的一律不要（小程序内容审核风险：涉黄 + 明星肖像权） */
const UNSAFE_TITLE =
  /美女|性感|尤物|福利|胸|腿|制服|泳装|比基尼|诱惑|情色|裸|写真|剧照|明星|演员|模特|杂志|超模|私房/i;

/** 明显是文件名 / 乱码 / 英文ID 的「标题」 */
function isJunkTitle(t: string): boolean {
  if (!t) return true;
  const s = t.trim();
  if (s.length < 3) return true;
  // 形如 20221011191419_f0e36 / G03j1HrWUAAYHiz / logo-doubao.png
  if (/^[A-Za-z0-9_\-.]{6,}$/.test(s)) return true;
  if (/\.(jpe?g|png|webp|gif|svg)$/i.test(s)) return true;
  if (/^https?:/i.test(s)) return true;
  if (!/[\u4e00-\u9fa5]/.test(s)) return true; // 必须含中文
  return false;
}

/** 清洗源站标题：去掉站名尾巴、多余符号，只留可读中文短语 */
function cleanTitle(t?: string): string {
  if (!t) return '';
  let s = t.trim();
  // 去掉「 - XXX网」「_堆糖」「| xxx」这类站名后缀
  s = s.split(/\s*[-|｜_]\s*/)[0];
  s = s.replace(/[【】\[\]()（）<>《》#＊*]/g, ' ').replace(/\s+/g, ' ').trim();
  // 去掉「4K手机壁纸高清全屏」这种通用尾巴，保留前面的场景描述
  const stripped = s.replace(/\s*\d*[kK]?\s*(手机|高清|全屏|壁纸|图片|大全|下载)+.*$/, '').trim();
  if (stripped.length >= 3) s = stripped;
  return s.slice(0, 16);
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export interface ComposeTitleInput {
  rawTitle?: string;
  tags?: string[];
  /** 分类展示名，如「治愈」 */
  label: string;
  type: MediaType;
  /** 源站稳定 ID，用作确定性哈希种子 */
  sid: string;
  /** 源站检索词；若 rawTitle 与它相同说明没有信息量 */
  keyword?: string;
  /** 重投次数（同分类内标题撞车时 +1），默认 0 */
  attempt?: number;
}

/** 判断源站标题是否有信息量（不等于检索词、不是垃圾串） */
function hasSignal(raw?: string, keyword?: string): boolean {
  if (!raw) return false;
  const s = cleanTitle(raw);
  if (isJunkTitle(s)) return false;
  if (keyword && (s === keyword.trim() || s.replace(SUFFIX.avatar, '') === keyword.replace(SUFFIX.avatar, ''))) {
    return false;
  }
  return true;
}

/** 从标签里挑一个可读中文短标签 */
function pickTag(tags?: string[]): string {
  if (!tags || !tags.length) return '';
  for (const t of tags) {
    const s = String(t).trim();
    if (s.length >= 2 && s.length <= 8 && /[\u4e00-\u9fa5]/.test(s) && !isJunkTitle(s)) return s;
  }
  return '';
}

/** 补齐类型后缀：若词尾已经带了「头像/壁纸/图片」等通用词，就不再重复追加 */
function ensureSuffix(text: string, type: MediaType): string {
  const s = text.trim();
  if (!s) return '';
  if (GENERIC_TAILS.some((t) => s.endsWith(t))) return s.slice(0, 24);
  return `${s}${SUFFIX[type]}`.slice(0, 24);
}

export function composeTitle(input: ComposeTitleInput): string {
  const { rawTitle, tags, label, type, sid, keyword, attempt = 0 } = input;

  // 1) 源站真标题：直接吃，本身往往已经是「场景词 + 壁纸」的形态
  if (hasSignal(rawTitle, keyword)) {
    const s = cleanTitle(rawTitle);
    if (s.length >= 4) return ensureSuffix(s, type);
  }

  // 2) 源站标签：拼成「标签 + 分类」
  const tag = pickTag(tags);
  if (tag && tag !== label) {
    return ensureSuffix(`${tag}${label}`, type);
  }

  // 3) 形容词池确定性组合（attempt 参与哈希，撞车时可换一个）
  const seed = `${sid}#${attempt}`;
  const adj = ADJECTIVES[hash(seed) % ADJECTIVES.length];
  return ensureSuffix(`${adj}${label}`, type);
}

/** 该标题是否触碰内容审核红线（命中则整张图跳过） */
export function isUnsafeText(s: string): boolean {
  return UNSAFE_TITLE.test(s);
}
