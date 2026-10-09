/**
 * 抓取源共用的 HTTP 工具
 */

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/** 默认请求头：带浏览器 UA 与中文语言偏好，避免被部分站点按爬虫拦截 */
export const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': USER_AGENT,
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

export async function fetchText(
  url: string,
  headers: Record<string, string> = {},
  timeout = 20000,
): Promise<string> {
  const res = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

export async function fetchJson<T = any>(
  url: string,
  headers: Record<string, string> = {},
  timeout = 20000,
): Promise<T> {
  const res = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, Accept: 'application/json,text/plain,*/*', ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

/** 空闲等待，降低对源站的压力（也降低被封风险） */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
