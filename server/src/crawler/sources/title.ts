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
 * 需要「不与已有标题重复」时用 composeUniqueTitle：它按候选序列顺序探测，
 * 取第一个未被占用的标题，而不是「试几次就加序号」。
 */

import { MediaType } from './types';

/** 通用 / 人物向形容词池（女生头像、微信头像、抖音头像等）
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
  '干净',
  '白月光',
  '初恋感',
  '甜妹',
  '软糯',
  '奶呼呼',
  '清甜',
  '淡雅',
  '素净',
  '温婉',
  '知性',
  '优雅',
  '气质',
  '酷飒',
  '破碎感',
  '高级灰',
  '莫兰迪',
  '奶油系',
  '焦糖',
  '摩卡',
  '晨雾',
  '晨曦',
  '暮色',
  '夜航',
  '雨天',
  '初雪',
  '晚风',
  '微光',
  '浅夏',
  '初秋',
  '春日',
  '暖阳',
  '静谧',
  '空灵',
  '梦幻',
  '童话',
  '幻境',
  '插画',
  '手绘',
  '水彩',
  '素描',
  '拼贴',
  '蔷薇',
  '鸢尾',
  '铃兰',
  '雏菊',
  '苔藓',
  '潮酷',
  '街头',
  '赛博',
  '胶片感',
  '韩系',
  '日系',
  '法式',
  '多巴胺',
  '美拉德',
  '元气感',
  '少御',
  '学院风',
  '校园',
  '初恋',
  '小清新',
  '文艺范',
  '民国',
  '法式慵懒',
  '芭蕾',
  '仙女',
  '神明感',
  '软妹',
  '拽姐',
  '飒爽',
  '清冷感',
  '温柔感',
  '电影感',
  '杂志感',
  '少女心',
  '素颜',
  '初恋系',
  '元气系',
  '氧气感',
  '通透感',
  '氛围拉满',
  // ---- 高价值搜索词补齐（原池缺失，但用户真实高频搜索）----
  'ins',
  '清新',
  '唯美',
  '搞怪',
  '马卡龙',
  '芭比',
];

/**
 * 男性向形容词池（「男生头像」这类分类专用）
 * --------------------------------------------------------------------------
 * 共用上面那套池子会产出「少女感男生头像」「超甜男生头像」这种语义错配。
 * 标题违和直接影响搜索结果里的点击率，而点击率是搜一搜排名的权重项，
 * 因此按内容域分池，而不是一套词打天下。
 */
const MALE_ADJECTIVES = [
  '清冷',
  '高级感',
  '极简',
  '复古',
  '港风',
  '胶片',
  '少年感',
  '痞帅',
  '沉稳',
  '干净',
  '阳光',
  '硬朗',
  '盐系',
  '暗黑',
  '酷感',
  '禁欲',
  '低饱和',
  '低调',
  '利落',
  '深邃',
  '不羁',
  '内敛',
  '冷淡',
  '清俊',
  '黑白',
  '深色',
  '质感',
  '学院',
  '牛仔',
  '机车',
  '日系',
  '韩系',
  '欧美',
  '街头',
  '工装',
  '机能',
  '冷酷',
  '高冷',
  '痞坏',
  '野性',
  '刚毅',
  '俊朗',
  '英气',
  '清秀',
  '白净',
  '斯文',
  '绅士',
  '稳重',
  '从容',
  '淡漠',
  '疏离',
  '孤傲',
  '墨色',
  '铁灰',
  '烟灰',
  '雾霾蓝',
  '藏青',
  '极夜',
  '雨夜',
  '噪点',
  '黑白灰',
  '工业',
  '金属',
  '赛博',
  '机械',
  '未来感',
  '末世',
  '硬核',
  '清冽',
  '沉默',
  '独行',
  '剪影',
  '背影',
  '侧脸',
  '运动风',
  '皮衣',
  '西装',
  '长风衣',
  '卫衣',
  '银饰',
  '寸头',
  '背头',
  '狼尾',
  '军装',
  '古风',
  '剑客',
  '江湖',
  '侠气',
  '冷月',
  '长夜',
  '破晓',
  '电竞',
  '摇滚',
  '朋克',
  '哥特',
  '暗夜',
  '低音',
  // ---- 高价值搜索词补齐 ----
  'ins',
  '清爽',
  '运动',
];

/**
 * 景物 / 抽象向形容词池（壁纸专用）
 * --------------------------------------------------------------------------
 * 壁纸主体是风景、抽象、文字，套用「邻家」「少女感」这类拟人词同样错配
 * （实测会产出「邻家抽象壁纸」「少女感苹果壁纸」）。
 */
const SCENE_ADJECTIVES = [
  '氛围感',
  '治愈',
  '复古',
  '胶片',
  '夏日',
  '落日',
  '清透',
  '奶油',
  '雾感',
  '低饱和',
  '森系',
  '海盐',
  '星空',
  '玻璃感',
  '油画',
  '极简',
  '抽象',
  '慢时光',
  '安静',
  '松弛感',
  '清欢',
  '梦幻',
  '静谧',
  '空灵',
  '微光',
  '深蓝',
  '极夜',
  '柔焦',
  '莫兰迪',
  '高级灰',
  '水彩',
  '水墨',
  '手绘',
  '插画',
  '拼贴',
  '几何',
  '线条',
  '渐变',
  '撞色',
  '霓虹',
  '赛博',
  '蒸汽波',
  '像素',
  '动漫',
  '二次元',
  '国风',
  '新中式',
  '青绿',
  '黛蓝',
  '月白',
  '藕荷',
  '琥珀',
  '鎏金',
  '雾霾蓝',
  '深海',
  '冰川',
  '极光',
  '银河',
  '星轨',
  '云海',
  '日出',
  '日落',
  '晨曦',
  '暮色',
  '夜航',
  '雨天',
  '初雪',
  '晚风',
  '芦苇',
  '苔藓',
  '枫叶',
  '樱花',
  '蒲公英',
  '麦田',
  '雪山',
  '沙漠',
  '潮汐',
  '电影感',
  '颗粒感',
  '暗调',
  '原木',
  '水泥',
  '大理石',
  '奶咖',
  '燕麦',
  '抹茶',
  '可可',
  '雾紫',
  '雾粉',
  '灰蓝',
  '藏蓝',
  // ---- 高价值搜索词补齐 ----
  'ins',
  '纯色',
  '清新',
  '虹彩',
  '马卡龙',
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

/**
 * 站点 UI 文案（客服按钮 / 导航 / 广告位）。
 * 实测彼岸图网列表页混有 alt="点击这里给我发消息" 的客服图标，
 * 不加过滤会被当作图片标题入库（产出「点击这里给我发消息壁纸」这种页面）。
 */
const SITE_UI_NOISE =
  /点击这里|给我发消息|在线客服|联系客服|客服|扫码|二维码|关注我们|关注公众|公众号|登录|注册|下载APP|下载客户端|手机版|电脑版|版权所有|意见反馈|返回顶部|上一页|下一页|上一篇|下一篇|猜你喜欢|相关推荐|用户协议|隐私政策|友情链接|网站地图|广告位/;

/** 明显是文件名 / 乱码 / 英文ID / 站点文案的「标题」 */
function isJunkTitle(t: string): boolean {
  if (!t) return true;
  const s = t.trim();
  if (s.length < 3) return true;
  if (SITE_UI_NOISE.test(s)) return true;
  // 形如 20221011191419_f0e36 / G03j1HrWUAAYHiz / logo-doubao.png
  if (/^[A-Za-z0-9_\-.]{6,}$/.test(s)) return true;
  if (/\.(jpe?g|png|webp|gif|svg)$/i.test(s)) return true;
  if (/^https?:/i.test(s)) return true;
  if (!/[\u4e00-\u9fa5]/.test(s)) return true; // 必须含中文
  return false;
}

/**
 * 分辨率标记。4K / 8K / 高清 本身就是用户高频搜索词，
 * 剥离「4K手机壁纸高清全屏」这类通用尾巴时不能把它一并丢掉，
 * 否则「凡人修仙传 梅凝 微笑 玫瑰花 4K…」会被削成一条不含 4K 的标题。
 */
const RESOLUTION_RE = /(\d{1,4}\s*[kK])/;

/** 清洗源站标题：去掉站名尾巴、多余符号，只留可读中文短语 */
function cleanTitle(t?: string): string {
  if (!t) return '';
  let s = t.trim();
  // 去掉「 - XXX网」「_堆糖」「| xxx」这类站名后缀
  s = s.split(/\s*[-|｜_]\s*/)[0];
  s = s.replace(/[【】\[\]()（）<>《》#＊*]/g, ' ').replace(/\s+/g, ' ').trim();
  const reso = (s.match(RESOLUTION_RE) || [])[0] || '';
  // 去掉「4K手机壁纸高清全屏」这种通用尾巴，保留前面的场景描述
  const stripped = s.replace(/\s*\d*[kK]?\s*(手机|高清|全屏|壁纸|图片|大全|下载|竖屏)+.*$/, '').trim();
  if (stripped.length >= 3) s = stripped;
  // 分辨率词回填（被当作通用尾巴剥掉了就补回尾部），
  // 且截断时必须先给它留出位置 —— 否则「…相机 4k」会被 slice 正好削掉 4k
  if (reso && !s.includes(reso)) s = `${s} ${reso}`;
  const MAX = 20;
  if (s.length > MAX) {
    s = reso
      ? `${s.slice(0, MAX - reso.length - 1).trimEnd()} ${reso}`
      : s.slice(0, MAX);
  }
  return s;
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
}

/** 归一化：剔除标点与空白，用于「源站标题是否只是检索词的变体」判据 */
const normalizeText = (s: string): string => s.replace(/[\s,，。.、·\-_|｜/：:；;！!？?（）()]/g, '');

/** 两串是否为同一组字符的不同排列（「壁纸 暗黑」≡「暗黑壁纸」） */
function isAnagram(a: string, b: string): boolean {
  if (!a.length || a.length !== b.length) return false;
  return [...a].sort().join('') === [...b].sort().join('');
}

/**
 * 判断源站标题是否有信息量（不等于检索词、不是垃圾串）。
 * --------------------------------------------------------------------------
 * 堆糖的 `msg` 实测大量是检索词的**词序/标点变体**：
 *   「暗黑壁纸」关键词 → msg 返回「壁纸 暗黑」「壁纸。暗黑。」「暗黑壁纸」
 * 它们逐字不同，但信息量与检索词完全等价 —— 若判为「有信号」直接入库，
 * 一个分类几十张图的标题依旧是同一句话，判重与无区分度问题原封不动地回来了。
 * 因此这里用「字符集相同即为变体」来识别，只有真正多出额外词的
 * （如「暗黑动漫风壁纸」）才算源站真标题。
 */
function hasSignal(raw?: string, keyword?: string): boolean {
  if (!raw) return false;
  const s = cleanTitle(raw);
  if (isJunkTitle(s)) return false;
  if (keyword) {
    const n = normalizeText(s);
    const k = normalizeText(keyword);
    if (n === k) return false; // 与检索词完全相同
    if (isAnagram(n, k)) return false; // 只是词序 / 标点变体
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

/** 拟人向词：即使落在壁纸分类（如「可爱壁纸」）也应按人物池取词，不能按景物池 */
const FIGURE_LABEL = /男|女|可爱|萌|卡通|少女|甜|情侣|御姐|正太|头像/;

/** 词池去重：两批词合并时若有重复，会让候选序列里出现重复项，白跑一轮探测 */
const dedupe = (arr: string[]): string[] => Array.from(new Set(arr));

/**
 * 高搜索热度词表（跨池共用）。
 * --------------------------------------------------------------------------
 * 判据是「用户在搜一搜/小红书里真的会这么打」——
 * 「高级感女生头像」「ins风女生头像」有人搜，「清欢女生头像」几乎没人搜，
 * 两者作为页面标题的曝光能力差一个量级。
 * 这些词在加权池里占更多槽位，使哈希起点更大概率落在它们身上。
 */
const HOT_WORDS = new Set([
  'ins',
  '可爱',
  '高级感',
  '清冷',
  '氛围感',
  '治愈',
  '复古',
  '极简',
  '简约',
  '动漫',
  '少女感',
  '温柔',
  '唯美',
  '甜酷',
  '小众',
  '元气',
  '日系',
  '韩系',
  '沙雕',
  'emo',
  '港风',
  '软萌',
  '酷飒',
  '清新',
  '梦幻',
  '高级灰',
  '莫兰迪',
  '暗黑',
  '星空',
  '4K',
  '少年感',
  '干净',
  '黑白',
  '阳光',
  '国风',
  '新中式',
  '纯色',
  '搞怪',
]);

/**
 * 语义冲突表：分类词与形容词的「色调 / 气质」对立关系。
 * --------------------------------------------------------------------------
 * 哈希选词本身是无状态的，会产出「奶咖暗黑壁纸」「撞色治愈壁纸」这类自相矛盾的标题。
 * 标题自相矛盾会直接压低搜索结果里的点击率（点击率又是排名权重项），
 * 所以宁可不写这个形容词，也不能写一个反义的。
 */
const CONFLICTS: Array<{ label: RegExp; bad: RegExp }> = [
  {
    // 暗色调系：配亮色 / 糖果色 / 甜美系会自相矛盾（「治愈暗黑壁纸」）
    label: /暗黑|暗调|黑白|冷淡|高冷|深色|墨色/,
    bad: /撞色|霓虹|多巴胺|美拉德|糖果|明艳|超甜|软萌|奶咖|奶油|马卡龙|蔷薇|鸢尾|铃兰|雏菊|芭比|治愈|清新|小清新|氧气|梦幻|童话|甜妹|奶呼呼|少女心|清爽|夏日|暖阳/,
  },
  {
    // 极简 / 简约：配高饱和撞色或繁复元素会打架
    label: /极简|简约/,
    bad: /撞色|霓虹|多巴胺|马卡龙|糖果|明艳|芭比|繁复|拼贴|蔷薇|鸢尾|铃兰|雏菊/,
  },
  {
    // 国风 / 新中式 / 文字：配西式潮酷或赛博不搭
    label: /国风|新中式|水墨|文字/,
    bad: /赛博|蒸汽波|像素|霓虹|潮酷|街头|机车|哥特|朋克|摇滚|电竞|机械|末世/,
  },
  {
    // 柔和治愈系：配暗黑 / 硬派不搭
    label: /治愈|温柔|清欢|安静|静谧|清新|小清新|淡雅|素净|温婉|干净|氧气|清透/,
    bad: /暗黑|暗调|机械|哥特|朋克|末世|硬核|工业|金属|赛博|撞色|霓虹|野性|不羁|机械|噪点/,
  },
  {
    // 可爱 / 软萌系：配冷硬暗黑不搭
    label: /可爱|萌|软|甜|奶/,
    bad: /暗黑|高冷|禁欲|暗调|机械|哥特|末世|冷峻|硬朗|铁灰|烟灰|墨色|工业|金属/,
  },
  {
    // 自然风景：配机械科幻不搭
    label: /风景|山水|自然|花|海|森|天空|星|云|日落|日出/,
    bad: /机械|赛博|哥特|末世|工业|金属|像素|噪点|机车|皮衣|电竞/,
  },
];

/**
 * 近义词组：同组内任意两词互斥。
 * 用于消除「极简简约壁纸」「暗调暗黑壁纸」这类同义反复 —— 语义重复会让标题
 * 显得机械，且对搜索命中没有任何额外贡献（评论文本时反而不自然）。
 */
const SYNONYM_GROUPS: string[][] = [
  ['极简', '简约', '简洁', '纯色'],
  ['暗黑', '暗调', '深色', '墨色'],
  ['清新', '清透', '清冷', '小清新'],
  ['可爱', '软萌', '软糯', '奶呼呼', '甜妹', '清甜', '超甜'],
  ['梦幻', '童话', '幻境'],
];

/** 两词是否互为近义（同组） */
function isSynonym(a: string, b: string): boolean {
  if (a === b) return true;
  for (const g of SYNONYM_GROUPS) {
    if (g.includes(a) && g.includes(b)) return true;
  }
  return false;
}

/** 形容词是否与分类词语义冲突（色调 / 气质对立，或同义反复） */
function conflicts(adj: string, label: string): boolean {
  if (isSynonym(adj, label)) return true;
  for (const c of CONFLICTS) {
    if (c.label.test(label) && c.bad.test(adj)) return true;
  }
  return false;
}

/** 高热词权重：在候选序列里重复占用的槽位数（越大越容易被哈希命中） */
const HOT_WEIGHT = 8;

/**
 * 用途 / 场景前置词。
 * --------------------------------------------------------------------------
 * 用户搜壁纸时高频带上用途限定：「手机壁纸」「全屏壁纸」「锁屏壁纸」。
 * 当形容词池被同一分类的图片占满时（单分类超过词池规模），
 * 用它做自然扩展 —— 「手机暗黑壁纸」远好过序号兜底的「暗黑壁纸2」，
 * 因为后者会被搜一搜按页面判重、互相覆盖，等于白收录。
 */
const USAGE_PREFIX: Record<MediaType, string[]> = {
  wallpaper: ['手机', '全屏', '高清', '竖屏', '锁屏'],
  avatar: ['高清', '免费', '唯美'],
};

/**
 * 构造加权形容词池。
 * --------------------------------------------------------------------------
 * 先剔除「与分类名相同」和「与分类语义冲突」的词，
 * 再把高热搜索词重复占位 —— 于是 `hash(sid) % pool.length` 的起点
 * 天然按权重分布，高热词被选中的概率是普通词的 HOT_WEIGHT 倍。
 *
 * 重复项不会造成标题重复：`composeUniqueTitle` 逐项探测时，
 * 撞到已占用的词会自动跳过，只是多花一轮探测。
 */
function weightedPool(pool: string[], label: string): string[] {
  const out: string[] = [];
  for (const w of dedupe(pool)) {
    if (w === label || conflicts(w, label)) continue;
    out.push(w);
    if (HOT_WORDS.has(w)) {
      for (let i = 1; i < HOT_WEIGHT; i++) out.push(w);
    }
  }
  return out;
}

/** 按分类语义挑形容词池，避免把人物向形容词套到景物上（反之亦然） */
function pickAdjectivePool(label: string, type: MediaType): string[] {
  if (type === 'wallpaper' && !FIGURE_LABEL.test(label)) return weightedPool(SCENE_ADJECTIVES, label);
  if (/男/.test(label)) return weightedPool(MALE_ADJECTIVES, label);
  return weightedPool(ADJECTIVES, label);
}

/** 补齐类型后缀：若词尾已经带了「头像/壁纸/图片」等通用词，就不再重复追加 */
function ensureSuffix(text: string, type: MediaType): string {
  let s = text.trim();
  if (!s) return '';
  // 合并相邻重复的通用词：「女生头像头像」→「女生头像」、「壁纸壁纸」→「壁纸」。
  // 源站标题偶有「头像 头像」这类重复，不做归一会直接产出读不通的页面标题。
  s = s.replace(/(头像|壁纸|图片|素材|大全)\s*\1+/g, '$1');
  if (GENERIC_TAILS.some((t) => s.endsWith(t))) return s.slice(0, 24);
  return `${s}${SUFFIX[type]}`.slice(0, 24);
}

/**
 * 标题候选序列（按优先级从高到低）。
 * --------------------------------------------------------------------------
 * 1) 源站真标题：本身往往已是「场景词 + 壁纸」的形态
 * 2) 源站标签：拼成「标签 + 分类」
 * 3) 形容词池：以 sid 哈希为起点，**顺序探测池中每一条**
 *
 * 第 3 级做成「完整序列」而不是「只取一个 / 只重试几次」，是因为：
 * 固定试几次就降级加序号，会在分类图片数接近词池规模时大量产出
 * 「夏日女生头像2」这类不自然的标题（实测 118 张的分类里，
 * 新增 10 张有 6 张带序号后缀）。顺序探测保证只要词池没被占满，
 * 就一定能找到空位，从根上不产出序号标题。
 *
 * 池子由 weightedPool 构造：已剔除与分类语义冲突的词，
 * 且高热搜索词占多个槽位 —— 于是哈希起点天然偏向「高级感女生头像」
 * 这类真实有人搜的标题，而不是「清欢女生头像」。
 */
function* titleCandidates(input: ComposeTitleInput): Generator<string> {
  const { rawTitle, tags, label, type, sid, keyword } = input;

  // 1) 源站真标题
  if (hasSignal(rawTitle, keyword)) {
    const s = cleanTitle(rawTitle);
    if (s.length >= 4) yield ensureSuffix(s, type);
  }

  // 2) 源站标签
  //    已是「XX壁纸 / XX头像」形态的标签没有区分度（同一分类每张图都一样），
  //    直接采用还会拼出「手机壁纸4K壁纸」这种重复词标题，故只接受有实义的短标签。
  const tag = pickTag(tags);
  if (tag && tag !== label && !GENERIC_TAILS.some((t) => tag.endsWith(t))) {
    yield ensureSuffix(`${tag}${label}`, type);
  }

  // 3) 形容词池：从哈希起点顺序取完整池
  const pool = pickAdjectivePool(label, type);
  if (pool.length) {
    const start = hash(sid) % pool.length;
    for (let step = 0; step < pool.length; step++) {
      const adj = pool[(start + step) % pool.length];
      const t = ensureSuffix(`${adj}${label}`, type);
      if (t) yield t;
    }

    // 4) 词池耗尽后的自然扩展：「用途词 + 形容词 + 分类」
    //    单分类图片数超过词池规模时，若直接退化为序号兜底，
    //    「暗黑壁纸2」会被搜一搜按页面判重、与「暗黑壁纸」互相覆盖，等于白收录。
    const start2 = hash(`${sid}#u`) % pool.length;
    for (let step = 0; step < pool.length; step++) {
      const adj = pool[(start2 + step) % pool.length];
      for (const u of USAGE_PREFIX[type]) {
        const t = ensureSuffix(`${u}${adj}${label}`, type);
        if (t) yield t;
      }
    }
  }
}

/** 生成标题（取优先级最高的候选）。需要「不与已有标题重复」时用 composeUniqueTitle。 */
export function composeTitle(input: ComposeTitleInput): string {
  const first = titleCandidates(input).next();
  return first.done ? '' : first.value;
}

/** 生成「在 used 集合内唯一」的标题所需的入参 */
export interface UniqueTitleInput {
  rawTitle?: string;
  tags?: string[];
  label: string;
  type: MediaType;
  /** 源站稳定 ID，作确定性哈希种子 */
  sid: string;
  keyword?: string;
}

/**
 * 生成在 `used` 集合内唯一的标题。
 * --------------------------------------------------------------------------
 * 按候选序列逐个探测，取第一个未被占用的；只有整个词池都被占满时，
 * 才退化为加序号兜底（正常情况下不会走到）。
 * 抓取（新素材入库）与存量回填（materials 服务）共用本函数，
 * 保证「新图」与「老图」的标题规则完全一致，不会两套逻辑分叉。
 */
export function composeUniqueTitle(input: UniqueTitleInput, used: Set<string>): string {
  for (const t of titleCandidates(input)) {
    if (t && !used.has(t)) return t;
  }
  // 词池 + 源站标题全部被占用（极端情况）：加序号保证唯一
  const base = composeTitle(input) || `${input.label}${SUFFIX[input.type]}`;
  let n = 2;
  let candidate = `${base}${n}`;
  while (used.has(candidate) && n < 999) {
    n++;
    candidate = `${base}${n}`;
  }
  return candidate;
}

/** 标题是否「无区分度、需要重新生成」（存量回填判据，与 isJunkTitle 同源） */
export function isTitleMeaningless(title: string | undefined, label: string): boolean {
  const s = (title || '').trim();
  if (!s) return true;
  // 与分类名完全一致 → 同分类几十张图标题一样，搜一搜按页面判重会互相覆盖
  if (s === label) return true;
  // 词池饱和后的序号兜底产物（「夏日女生头像2」「港风壁纸3」）——
  // 唯一但不自然，属于需要重新生成的低质量标题
  if (/(头像|壁纸)\d{1,2}$/.test(s)) return true;
  // 源站图片 ID 之类：G03j1HrWUAAYHiz / 20221011191419_f0e36
  if (/^[A-Za-z0-9_\-. ]{6,}$/.test(s)) return true;
  // 不含中文 → 用户不可能搜到
  if (!/[\u4e00-\u9fa5]/.test(s)) return true;
  return false;
}

/** 该标题是否触碰内容审核红线（命中则整张图跳过） */
export function isUnsafeText(s: string): boolean {
  return UNSAFE_TITLE.test(s);
}

/**
 * AI 生成内容识别。
 * --------------------------------------------------------------------------
 * 站点明确不收录 AI 生成的头像 / 壁纸（调性与合规考虑）。
 * 国内图站有大量「AI绘画」「AI生成」「Midjourney」标签的图混在普通图里，
 * 光靠分类过滤挡不住 —— 它们散落在「动漫」「风景」「女生头像」等正常分类中，
 * 必须按标题 / 标签 / 检索词逐条识别。
 *
 * 判据刻意写得保守：只匹配明确的「AI 指代词」，
 * 不匹配任何正常的艺术风格词（「赛博朋克」「未来感」「机甲」都不等于 AI），
 * 以免把真人实拍与非 AI 插画一并误伤。
 *
 * 注意 `\bai\b` 在中文串里也能命中（如「高清AI壁纸」），
 * 但不会命中 air / train / Thai 这类普通英文词 —— 它们不满足词边界。
 */
const AI_MARKERS =
  /(\bai\b|ai绘画|ai生成|ai绘图|ai作图|ai壁纸|ai头像|ai插画|ai美女|ai动漫|ai写真|ai换脸|人工智能|智能生成|一键生成|自动生成|生成式|文生图|图生图|大模型|midjourney|stable[\s-]?diffusion|novelai|dall[\s·\-–—]*e|firefly|文心一格|通义万相)/i;

/** 给定若干文本（标题 / 标签 / 检索词），是否命中 AI 生成特征 */
export function isAiContent(...texts: Array<string | undefined | null>): boolean {
  for (const t of texts) {
    if (t && AI_MARKERS.test(String(t))) return true;
  }
  return false;
}
