import { Injectable, OnModuleInit } from '@nestjs/common';
import { FileStore } from '@/common/file-store.service';

/** 全局可动态维护的配置项（后台可改，写回 server/data/config.json） */
export interface AppConfig {
  appName: string;      // 小程序名称
  contactEmail: string; // 侵权投诉邮箱
  adminPassword: string; // 管理后台登录口令（勿泄露，不向下发）
  bannerAdId: string;   // 流量主 banner 广告位 ID（空=隐藏）
  rewardAdId: string;   // 流量主激励视频广告位 ID（空=解锁降级）
  aiModel: string;      // AI 生图模型
  aiModelEndpoint: string; // AI 生图模型地址（modelBaseUrl），留空用平台默认
  aiSize: string;       // AI 生图尺寸档位（SDK 仅支持 2K / 4K）
  aiSystemPrompt: string; // 生图 prompt 润色时可追加的系统约束
  // 对象存储（七牛云 S3 兼容）——用于后台上传壁纸素材的远程存储
  ossEndpoint: string;  // 七牛云 S3 兼容访问域名（如 https://s3-cn-east-1.qiniucs.com）
  ossBucket: string;    // 空间（Bucket）名称
  ossRegion: string;    // 区域（默认 cn-east-1 华东）
  ossAccessKey: string; // AK
  ossSecretKey: string; // SK（敏感，不向下发）
  ossPublicUrl: string; // 空间公开读域名（如 CDN / bkt.clouddn.com），用于拼接素材访问 URL；留空则用短期预签名 URL
}

const DEFAULT_CONFIG: AppConfig = {
  appName: 'AI头像壁纸大全',
  contactEmail: 'admin@example.com',
  adminPassword: 'admin888',
  bannerAdId: '',
  rewardAdId: '',
  aiModel: 'doubao-seedream-4-5-251128',
  aiModelEndpoint: '',
  aiSize: '2K',
  aiSystemPrompt: '',
  ossEndpoint: '',
  ossBucket: '',
  ossRegion: 'cn-east-1',
  ossAccessKey: '',
  ossSecretKey: '',
  ossPublicUrl: '',
};

@Injectable()
export class ConfigService implements OnModuleInit {
  private cache: AppConfig = DEFAULT_CONFIG;

  constructor(private readonly store: FileStore) {}

  onModuleInit() {
    this.reload();
  }

  reload() {
    this.cache = Object.assign(
      {},
      DEFAULT_CONFIG,
      this.store.read('config.json', DEFAULT_CONFIG),
    );
  }

  /** 完整配置（仅管理端使用） */
  get(): AppConfig {
    return this.cache;
  }

  /** 合并局部更新并落盘 */
  update(patch: Partial<AppConfig>): AppConfig {
    this.cache = Object.assign({}, this.cache, patch);
    this.store.write('config.json', this.cache);
    return this.cache;
  }

  /** 公网可读的配置（去除敏感项：管理口令、OSS 密钥），供小程序前端下发 */
  getPublic() {
    const {
      adminPassword: _pwd,
      ossSecretKey: _sk,
      ossAccessKey: _ak,
      ...publicConfig
    } = this.cache;
    return publicConfig;
  }
}