import { Injectable, OnModuleInit } from '@nestjs/common';
import { FileStore } from '@/common/file-store.service';

/** 全局可动态维护的配置项（后台可改，写回 server/data/config.json） */
export interface AppConfig {
  appName: string;      // 小程序名称
  contactEmail: string; // 侵权投诉邮箱
  adminPassword: string; // 管理后台登录口令（勿泄露，不向下发）
  bannerAdId: string;   // 流量主 banner 广告位 ID（空=隐藏）
  rewardAdId: string;   // 流量主激励视频广告位 ID（空=解锁降级）
  // 对象存储（七牛云 S3 兼容）——用于后台上传壁纸素材的远程存储
  ossEndpoint: string;  // 七牛云 S3 兼容访问域名（如 https://s3-cn-east-1.qiniucs.com）
  ossBucket: string;    // 空间（Bucket）名称
  ossRegion: string;    // 区域（默认 cn-east-1 华东）
  ossAccessKey: string; // AK
  ossSecretKey: string; // SK（敏感，不向下发）
  ossPublicUrl: string; // 空间公开读域名（如 CDN / bkt.clouddn.com），用于拼接素材访问 URL；留空则用短期预签名 URL
  // 微信搜一搜「页面内容推送」（wxaapi_submitpages）——主动把页面推给微信收录
  mpAppId: string;      // 小程序 AppID
  mpAppSecret: string;  // 小程序 AppSecret（敏感，不向下发；mp 后台「开发管理 → 开发设置」获取）
}

const DEFAULT_CONFIG: AppConfig = {
  appName: '简影壁纸馆',
  contactEmail: 'admin@example.com',
  adminPassword: 'admin888',
  bannerAdId: '',
  rewardAdId: '',
  ossEndpoint: '',
  ossBucket: '',
  ossRegion: 'cn-east-1',
  ossAccessKey: '',
  ossSecretKey: '',
  ossPublicUrl: '',
  mpAppId: '',
  mpAppSecret: '',
};

@Injectable()
export class ConfigService implements OnModuleInit {
  constructor(private readonly store: FileStore) {}

  onModuleInit() {
    const cfg = this.get();
    console.log(`[Config] 已加载配置: appName=${cfg.appName}`);
  }

  /**
   * 当前配置：**每次实时取**（数据单一来源在 FileStore）。
   * 本服务以前自持一份 cache 副本，在 FileStore 检测到数据库被别的实例改过并刷新后，
   * 这里还是旧值；保存时以旧值为基底会把并发改动盖掉，所以改为读时即取最新。
   */
  get(): AppConfig {
    return Object.assign({}, DEFAULT_CONFIG, this.store.read('config.json', DEFAULT_CONFIG));
  }

  /** 兼容旧调用点（等价于 get，仅用于日志/刷新后重新读取） */
  reload(): AppConfig {
    return this.get();
  }

  /** 合并局部更新并落盘（以最新值为基底，避免丢并发改动） */
  update(patch: Partial<AppConfig>): AppConfig {
    const next = Object.assign({}, this.get(), patch);
    this.store.write('config.json', next);
    return next;
  }

  /** 公网可读的配置（去除敏感项：管理口令、OSS 密钥、AppSecret），供小程序前端下发 */
  getPublic() {
    const {
      adminPassword: _pwd,
      ossSecretKey: _sk,
      ossAccessKey: _ak,
      mpAppSecret: _mpSecret,
      ...publicConfig
    } = this.get();
    return publicConfig;
  }
}