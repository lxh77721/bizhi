/**
 * 用户端服务：无密码轻量身份（clientId 持久化在本地）+ 点赞/下载/口令取图
 */
import Taro from '@tarojs/taro';
import { Network } from '@/network';

const CLIENT_KEY = 'user_client_id';

export interface MaterialItem {
  id: string;
  code?: string;
  title: string;
  category: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  tags: string[];
  type?: 'avatar' | 'wallpaper';
}

export interface UserData {
  user: { userId: string; nickname: string };
  likes: MaterialItem[];
  downloads: MaterialItem[];
}

function genClientId(): string {
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 获取本地持久化身份；不存在则自动生成（视为“登录”） */
export function getClientId(): string {
  let id = Taro.getStorageSync(CLIENT_KEY) as string;
  if (!id) {
    id = genClientId();
    Taro.setStorageSync(CLIENT_KEY, id);
  }
  return id;
}

/** 是否已登录（本地已存在身份） */
export function isLogged(): boolean {
  return !!Taro.getStorageSync(CLIENT_KEY);
}

/** 退出登录：清除本地身份（下次进入视为新用户） */
export function logoutLocal() {
  Taro.removeStorageSync(CLIENT_KEY);
}

function unwrap(res: any): any {
  return (res.data as any)?.data;
}

/** 登录（幂等创建用户并返回其数据） */
export async function userLogin(): Promise<UserData> {
  const res = await Network.request({
    url: '/api/user/login',
    method: 'POST',
    data: { clientId: getClientId() },
  });
  return unwrap(res) as UserData;
}

/** 获取当前用户数据（点赞/下载列表） */
export async function fetchMe(): Promise<UserData> {
  const res = await Network.request({ url: '/api/user/me', data: { clientId: getClientId() } });
  return unwrap(res) as UserData;
}

/** 点赞/取消点赞 */
export async function toggleLike(materialId: string): Promise<{ liked: boolean; likes: MaterialItem[] }> {
  const res = await Network.request({
    url: '/api/user/toggle-like',
    method: 'POST',
    data: { clientId: getClientId(), materialId },
  });
  return unwrap(res) as { liked: boolean; likes: MaterialItem[] };
}

/** 记录下载 */
export async function markDownload(materialId: string): Promise<{ downloads: MaterialItem[] }> {
  const res = await Network.request({
    url: '/api/user/mark-download',
    method: 'POST',
    data: { clientId: getClientId(), materialId },
  });
  return unwrap(res) as { downloads: MaterialItem[] };
}

/** 口令取图：通过 8 位口令码获取素材 */
export async function fetchByCode(code: string): Promise<{ material: MaterialItem }> {
  const res = await Network.request({
    url: '/api/user/fetch-by-code',
    method: 'POST',
    data: { code },
  });
  return unwrap(res) as { material: MaterialItem };
}