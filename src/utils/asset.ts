/**
 * 图片资源地址解析工具
 * --------------------------------------------------------------------------
 * 素材来源有两种：AI 在线生成（返回完整 http URL）与 本地物理存储（相对 /static 路径）。
 * 本工具把相对路径解析为可访问的完整地址：
 *   - 已以 http:// 或 https:// 开头的 URL 原样返回（生成的 TOS 图片也用这里）
 *   - /static/... 相对路径：
 *       · H5/浏览器端 → 返回相对路径，交由页面当前域+ Vite dev 代理（/static → 后端）加载
 *       · 小程序端   → 拼接 PROJECT_DOMAIN（构建时注入的项目域名），访问后端静态资源
 * --------------------------------------------------------------------------
 */
import Taro from '@tarojs/taro'

declare const PROJECT_DOMAIN: string

export function assetUrl(url: string): string {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url
  // H5 / 浏览器环境：走相对路径，由 Vite dev server 将 /static 代理到后端
  if (Taro.getEnv() === Taro.ENV_TYPE.WEB) {
    return url
  }
  // 小程序端：拼接项目域名
  const base = (typeof PROJECT_DOMAIN !== 'undefined' ? PROJECT_DOMAIN : '') || ''
  const cleanBase = base.replace(/\/+$/, '')
  const cleanPath = url.startsWith('/') ? url : `/${url}`
  return cleanBase ? `${cleanBase}${cleanPath}` : cleanPath
}