import { Injectable, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@/config/config.service';

/**
 * 对象存储服务（七牛云 S3 兼容，直连）
 * --------------------------------------------------------------------------
 * 说明：coze-coding-dev-sdk 的 S3Storage 在沙箱内会强制走平台代理存储，无法直连
 * 用户自己的七牛云。因此这里直接使用 AWS S3 兼容客户端（path-style）连七牛：
 *   endpoint: https://s3.<region>.qiniucs.com（不含桶名）
 *   region:   如 cn-south-1 / cn-east-1 / cn-north-1
 *   AK/SK:    七牛云密钥管理
 * 上传素材后返回可访问 URL：优先用公开读域名 ossPublicUrl 拼接，否则返回
 * 30 天有效的预签名查询 URL（由七牛 S3 签名生成）。
 */
@Injectable()
export class OssService {
  constructor(private readonly configService: ConfigService) {}

  /** 已配置对象存储（bucket + SK + endpoint 齐备才启用） */
  isConfigured(): boolean {
    const c = this.configService.get();
    return !!(c.ossBucket && c.ossSecretKey && c.ossEndpoint);
  }

  /**
   * 规范化 S3 endpoint：
   * - 去结尾斜杠
   * - 去掉用户误填的桶名前缀（bkt.s3-region.qiniucs.com → s3-region.qiniucs.com）
   */
  private normalizeEndpoint(endpoint: string, bucket: string): string {
    let ep = endpoint.trim().replace(/\/+$/, '');
    if (bucket) {
      ep = ep.replace(new RegExp(`^https?://${bucket}\\.`, 'i'), (m) =>
        /^https/i.test(m) ? 'https://' : 'http://',
      );
    }
    return ep;
  }

  /** 规范化公开读域名：确保带协议头，去结尾斜杠 */
  private normalizePublicUrl(url: string): string {
    let u = (url || '').trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
    return u;
  }

  private buildClient(): S3Client {
    const c = this.configService.get();
    return new S3Client({
      endpoint: this.normalizeEndpoint(c.ossEndpoint, c.ossBucket),
      region: (c.ossRegion || 'cn-east-1').trim(),
      forcePathStyle: true,
      credentials: {
        accessKeyId: (c.ossAccessKey || '').trim(),
        secretAccessKey: (c.ossSecretKey || '').trim(),
      },
    });
  }

  /** 生成合规对象 key（与 SDK 规则保持一致：目录/名_短随机.扩展名） */
  private buildKey(fileName: string): string {
    const safe = fileName.replace(/^\/+/, '');
    const slash = safe.lastIndexOf('/');
    const dir = slash >= 0 ? safe.slice(0, slash + 1) : '';
    const base = slash >= 0 ? safe.slice(slash + 1) : safe;
    const dot = base.lastIndexOf('.');
    const name = dot >= 0 ? base.slice(0, dot) : base;
    const ext = dot >= 0 ? base.slice(dot) : '';
    const rand = Math.random().toString(16).slice(2, 10);
    return `${dir}${name}_${rand}${ext}`;
  }

  /**
   * 上传文件到七牛云，返回可访问 URL。
   */
  async upload(buffer: Buffer, fileName: string, contentType?: string): Promise<string> {
    const c = this.configService.get();
    const ak = (c.ossAccessKey || '').trim();
    const sk = (c.ossSecretKey || '').trim();
    // 七牛云 AK/SK 标准长度均为 40 位；明显不符时提前给出可操作提示
    if (!ak || !sk || ak.length < 20 || sk.length < 20) {
      throw new BadRequestException(
        '七牛云 AccessKey/SecretKey 无效：请到七牛云「密钥管理」完整复制（AK/SK 通常均为 40 位）',
      );
    }
    const key = this.buildKey(fileName);
    const client = this.buildClient();

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: c.ossBucket,
          Key: key,
          Body: buffer,
          ContentType: contentType || 'image/jpeg',
        }),
      );
    } catch (err: any) {
      console.error('[OSS] 七牛云上传失败', err?.name, err?.message, err?.$metadata);
      throw new BadRequestException(
        `七牛云上传失败：${err?.name || ''} ${err?.message || '请检查 Endpoint / 区域 / AK / SK / 空间名'}`,
      );
    }

    if (c.ossPublicUrl) {
      return `${this.normalizePublicUrl(c.ossPublicUrl)}/${key}`;
    }
    // 未配置公开读域名：生成 SigV4 预签名 GET URL 作为临时访问地址。
    // 注意：AWS SigV4 预签名最大有效期为一周（604800s），超出会抛
    // “Signature version 4 presigned URLs must have an expiration date
    //  less than one week in the future”。建议在七牛开通公开读域名后
    // 填入“OSS 公开读域名”，以获得长期稳定的访问地址。
    try {
      const signed = await getSignedUrl(client, new GetObjectCommand({ Bucket: c.ossBucket, Key: key }), {
        expiresIn: 604800,
      });
      return signed;
    } catch (err: any) {
      console.warn('[OSS] 预签名生成失败，回退公开 path-style URL', err?.message);
      return `https://${c.ossBucket}.${c.ossRegion || 'cn-east-1'}.qiniucs.com/${key}`;
    }
  }
}