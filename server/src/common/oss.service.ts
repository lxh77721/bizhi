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
    const ep = this.normalizeEndpoint(c.ossEndpoint, c.ossBucket);
    // 兼容两类 S3 服务商：
    // - 七牛云采用 path-style（endpoint 形如 https://s3-<region>.qiniucs.com，请求为 endpoint/bucket/key）
    // - 阿里云等标准 S3 采用虚拟主机风格（<bucket>.<endpoint>，请求 host 即 Bucket 公网域名，更好配合公开读域名）
    const virtualHosted = !/qiniucs/i.test(ep);
    return new S3Client({
      endpoint: ep,
      region: (c.ossRegion || 'cn-east-1').trim(),
      forcePathStyle: !virtualHosted,
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
   * 上传文件到对象存储，返回可访问 URL。
   */
  async upload(buffer: Buffer, fileName: string, contentType?: string): Promise<string> {
    const c = this.configService.get();
    const ak = (c.ossAccessKey || '').trim();
    const sk = (c.ossSecretKey || '').trim();
    // AK/SK 明显过短时提前按通用规则提示（阿里云 AK 形如 LTAI…、七牛 AK/SK 通常 40 位)
    if (!ak || !sk || ak.length < 10 || sk.length < 10) {
      throw new BadRequestException(
        '对象存储 AccessKey/SecretKey 无效：请到对应云控制台完整复制 AccessKey ID / AccessKey Secret',
      );
    }
    const key = this.buildKey(fileName);
    const client = this.buildClient();

    const put = (acl: 'public-read' | undefined) =>
      client.send(
        new PutObjectCommand({
          Bucket: c.ossBucket,
          Key: key,
          Body: buffer,
          ContentType: contentType || 'image/jpeg',
          ...(acl ? { ACL: acl } : {}),
        }),
      );

    // 优先尝试「公共读」ACL，使对象通过公网域名可匿名读取；
    // 若 Bucket 已开启公共访问/ACL（允许公共读）则无需再手动配置。
    // 若 Bucket 强制禁止 ACL（如开启“禁止公共访问”），则回退为默认私有上传，
    // 此时需要到控制台把 Bucket 设为“公共读”，否则公网域名仍返回 403。
    try {
      await put('public-read');
    } catch (err: any) {
      const m = `${err?.name || ''} ${err?.message || ''}`;
      if (/ACL|AccessControl|AllAccessDisabled|NotSupported|AccessDenied|Forbidden/i.test(m)) {
        await put(undefined);
      } else {
        console.error('[OSS] 上传失败', err?.name, err?.message, err?.$metadata);
        throw new BadRequestException(
          `对象存储上传失败：${err?.name || ''} ${err?.message || '请检查 Endpoint / 区域 / AK / SK / Bucket'}`,
        );
      }
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