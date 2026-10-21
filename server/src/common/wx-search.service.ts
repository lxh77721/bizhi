import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@/config/config.service';
import { FileStore } from '@/common/file-store.service';

/**
 * 微信搜一搜「页面内容推送」（wxaapi_submitpages）
 * --------------------------------------------------------------------------
 * 被动等爬虫来抓对小程序冷启动很慢：官方提供主动推送接口，把页面路径+参数
 * 推给微信搜索，能明显提高收录及时率。接口在服务端调用，需要 AppID/AppSecret
 * 换 access_token（在后台「配置」页填写）。
 *
 * 这里的另一个价值是「诊断」：errcode=85091 直接说明 mp 后台的「页面收录」
 * 开关是关闭的 —— 这是收录概况一直空白最常见的、且只有后台能查的原因。
 *
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/server/API/wxsearch/api_submitpages.html
 */

/** 一次推送的完整结果（errcode/errmsg 原样透传，hint 翻译成下一步动作） */
export interface WxPushResult {
  ok: boolean;
  errcode: number;
  errmsg: string;
  /** 本次尝试推送的页面数 */
  total: number;
  /** 给运营者看的解释 */
  hint: string;
}

export interface WxPushPage {
  /** 以 pages/ 开头的页面路径 */
  path: string;
  /** 页面参数，形如 k1=v1&k2=v2；无参数传空字符串 */
  query: string;
}

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const SUBMIT_URL = 'https://api.weixin.qq.com/wxa/search/wxaapi_submitpages';
/** 官方限制：单次最多 1000 个页面 */
const MAX_PAGES_PER_CALL = 1000;

const SUBMIT_HINTS: Record<number, string> = {
  0: '推送成功。收录结果次日到 mp 后台「推广与搜索 → 页面内容接入 → 接入概况」查看',
  40066: '有页面被 sitemap 规则拦截，请检查 src/sitemap.json 的 disallow 规则',
  40210: '有页面的 path 不存在或为空，请检查页面路径拼写',
  40211: '结构化数据校验失败：微信可能已要求携带 data_list 结构化内容。若确认配置无误仍报此错，说明你的账号暂不支持该推送方式，请依赖被动收录并做好内容质量',
  40212: 'query 格式不合法（必须是 k1=v1&k2=v2 的 URL 参数形式）',
  40219: 'pages 为空，没有可推送的页面',
  45002: '请求包过大，请减少单次推送页面数',
  47001: '请求体不是合法 JSON（一般是服务端问题，请重试）',
  47004: '单次提交超过 1000 个页面',
  47006: '今日推送配额已用完，明天再推即可',
  85091: '小程序的「页面收录」开关是关闭的。去 mp 后台「推广与搜索 → 页面内容接入 → 基础设置」打开开关再推 —— 这就是收录概况一直空白的最直接原因',
  85083: '小程序搜索功能被禁用（可能存在违规限制），请到 mp 后台查看站内通知',
  108001: '微信系统错误，重试即可（请求中的页面可能部分成功）',
  108002: '单个页面数据超过 1MB 上限',
  108003: '推送未被允许：正式推送前需先在 mp 后台「推广与搜索 → 微信搜索 → 运营中心 → 内容接入」提交申请并通过审核。被动收录（爬虫抓取）不受此限制，请确保「页面收录」开关开启',
};

const TOKEN_HINTS: Record<number, string> = {
  40013: 'AppID 不对，请核对「配置」页里填的 mpAppId',
  41002: '缺少 AppID，请到「配置」页填写',
  41004: 'AppSecret 不对或已被重置，请到 mp 后台「开发管理 → 开发设置」重新生成并填入',
  40164: '服务器 IP 不在小程序白名单。到 mp 后台「开发管理 → 开发设置 → IP 白名单」把部署环境的出口 IP 加进去',
  45009: '调用频率超限，请稍后重试',
};

@Injectable()
export class WxSearchService {
  private readonly logger = new Logger('WxSearch');

  constructor(
    private readonly config: ConfigService,
    private readonly store: FileStore,
  ) {}

  /** 组装全部可收录页面：静态页 + 专题页（按分类）+ 详情页（按素材，搜一搜最大的入口） */
  buildPages(): WxPushPage[] {
    const pages: WxPushPage[] = [
      { path: 'pages/index/index', query: '' },
      { path: 'pages/avatar/index', query: '' },
      { path: 'pages/wallpaper/index', query: '' },
      { path: 'pages/faq/index', query: '' },
    ];

    // 直接读 FileStore，避免 CommonModule 反向依赖 MaterialsModule 造成循环
    const file = this.store.read<{ materials: Array<{ id: string }>; categories: Array<{ key: string }> }>(
      'materials.json',
      { materials: [], categories: [] },
    );
    for (const c of file.categories || []) {
      if (c && c.key) {
        pages.push({ path: 'pages/topic/index', query: `category=${encodeURIComponent(c.key)}` });
      }
    }
    // 详情页留足余量：1000 上限 - 上面已占用的条数
    const room = MAX_PAGES_PER_CALL - pages.length;
    for (const m of (file.materials || []).slice(0, room)) {
      if (m && m.id) {
        pages.push({ path: 'pages/detail/index', query: `id=${encodeURIComponent(m.id)}` });
      }
    }
    return pages.slice(0, MAX_PAGES_PER_CALL);
  }

  /** 推送页面到搜一搜收录；不传 pages 则推全部可收录页面 */
  async pushPages(pages?: WxPushPage[]): Promise<WxPushResult> {
    const list = pages && pages.length ? pages : this.buildPages();
    const { mpAppId, mpAppSecret } = this.config.get();

    if (!mpAppId || !mpAppSecret) {
      return {
        ok: false,
        errcode: -2,
        errmsg: '未配置小程序 AppID / AppSecret',
        total: list.length,
        hint: '请先到后台「系统配置」页填写小程序 AppID 与 AppSecret（mp 后台「开发管理 → 开发设置」获取），保存后再推送',
      };
    }

    try {
      const token = await this.getAccessToken(mpAppId, mpAppSecret);
      const res = await this.postJson(`${SUBMIT_URL}?access_token=${encodeURIComponent(token)}`, {
        pages: list,
      });
      const errcode = Number(res?.errcode ?? -1);
      const errmsg = String(res?.errmsg ?? '');
      const result: WxPushResult = {
        ok: errcode === 0,
        errcode,
        errmsg,
        total: list.length,
        hint: SUBMIT_HINTS[errcode] || (errmsg ? `微信返回：${errmsg}` : '未知返回，请把 errcode/errmsg 提供给开发者'),
      };
      if (errcode === 0) {
        this.logger.log(`已向搜一搜推送 ${list.length} 个页面`);
      } else {
        this.logger.warn(`搜一搜推送失败: errcode=${errcode} errmsg=${errmsg}`);
      }
      return result;
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`搜一搜推送异常: ${msg}`);
      return {
        ok: false,
        errcode: -1,
        errmsg: msg,
        total: list.length,
        hint: `请求微信接口失败（${msg}）。多为网络问题或 IP 白名单，请稍后重试`,
      };
    }
  }

  /** 抓取完成后只推本次新增的详情页，避免每次整包重推 */
  async pushMaterialDetails(ids: string[]): Promise<WxPushResult | null> {
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length) return null;
    return this.pushPages(
      unique.slice(0, MAX_PAGES_PER_CALL).map((id) => ({
        path: 'pages/detail/index',
        query: `id=${encodeURIComponent(id)}`,
      })),
    );
  }

  /** 换取 access_token；失败时把错误码翻译成「去哪里改配置」 */
  private async getAccessToken(appId: string, secret: string): Promise<string> {
    const url =
      `${TOKEN_URL}?grant_type=client_credential` +
      `&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}`;
    const res = await this.getJson(url);
    if (res?.access_token) return String(res.access_token);

    const errcode = Number(res?.errcode ?? -1);
    const hint =
      TOKEN_HINTS[errcode] || `mp 后台返回 errcode=${errcode} errmsg=${res?.errmsg || ''}`;
    throw new Error(hint);
  }

  private async getJson(url: string): Promise<any> {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  private async postJson(url: string, body: unknown): Promise<any> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}
