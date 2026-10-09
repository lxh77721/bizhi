import Taro from '@tarojs/taro';

/** 管理后台登录 token 的本地缓存键 */
export const TOKEN_KEY = 'admin_token';

/** 带登录 token 的请求头（所有管理端接口必带） */
export function authHeader(): Record<string, string> {
  const token = Taro.getStorageSync(TOKEN_KEY);
  return { Authorization: `Bearer ${token}` };
}

/** 401 处理：清 token 并回到登录入口，避免在子页面裸奔 */
export function handleUnauthorized() {
  Taro.removeStorageSync(TOKEN_KEY);
  Taro.showToast({ title: '登录已失效，请重新登录', icon: 'none' });
  setTimeout(() => {
    Taro.reLaunch({ url: '/pages/admin/index' });
  }, 600);
}

export interface AdminMaterial {
  id: string;
  title: string;
  category: string;
  url: string;
  thumbUrl: string;
  tags?: string[];
  type?: 'avatar' | 'wallpaper';
  code?: string;
}

export interface AdminCategory {
  key: string;
  label: string;
  type?: 'avatar' | 'wallpaper';
}

export interface AdminStats {
  materialCount: number;
  categoryCount: number;
  unlockCount: number;
}

export interface PubConfig {
  appName: string;
  contactEmail: string;
  adminPassword: string;
  bannerAdId: string;
  rewardAdId: string;
  ossEndpoint: string;
  ossBucket: string;
  ossRegion: string;
  ossAccessKey: string;
  ossSecretKey: string;
  ossPublicUrl: string;
}
