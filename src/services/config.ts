import { Network } from '@/network';

/** 公网配置（后端从 server/data/config.json 下发，含流量主 ID 等，可后台动态维护） */
export interface PublicConfig {
  appName: string;
  contactEmail: string;
  bannerAdId: string;
  rewardAdId: string;
  aiModel: string;
  aiModelEndpoint?: string;
  aiSize: string;
  aiSystemPrompt: string;
  ossEndpoint?: string;
  ossBucket?: string;
  ossRegion?: string;
  ossPublicUrl?: string;
}

let cached: PublicConfig | null = null;

/** 拉取云端配置并缓存到内存（首页/详情页启动时调用） */
export async function fetchPublicConfig(): Promise<PublicConfig | null> {
  try {
    const res = await Network.request({ url: '/api/config' });
    const data = (res.data as any)?.data as PublicConfig;
    if (data) cached = data;
  } catch (err) {
    console.warn('[Config] 拉取云端配置失败，使用本地下发默认值', err);
  }
  return cached;
}

export function getPublicConfig(): PublicConfig | null {
  return cached;
}