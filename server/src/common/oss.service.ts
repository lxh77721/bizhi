import { Injectable, BadRequestException } from '@nestjs/common';
import { S3Storage } from 'coze-coding-dev-sdk';
import { ConfigService } from '@/config/config.service';

/**
 * 对象存储服务（七牛云 S3 兼容）
 * --------------------------------------------------------------------------
 * 后台上传素材时，若已在后台配置了七牛云 OSS（ossBucket 非空），则文件上传到
 * 七牛云并返回可访问 URL；素材的访问 URL 优先使用具备公开读能力的
 * `ossPublicUrl`（CDN/测试域名）拼接，否则回退为长期有效(30天)的预签名 URL。
 * 注意：uploadFile 返回的是实际存储 key（SDK 会加 UUID 前缀），必须用它拼 URL。
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
   * 上传文件到对象存储，返回可访问 URL。
   * @param buffer 文件内容
   * @param fileName 建议文件名（存入 bucket 的 key 由 SDK 生成，带 UUID 前缀避免冲突）
   */
  async upload(buffer: Buffer, fileName: string, contentType?: string): Promise<string> {
    const c = this.configService.get();
    const storage = new S3Storage({
      endpointUrl: c.ossEndpoint,
      accessKey: c.ossAccessKey,
      secretKey: c.ossSecretKey,
      bucketName: c.ossBucket,
      region: c.ossRegion || 'cn-east-1',
    });

    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: contentType || 'image/jpeg',
    });
    if (!key) {
      throw new BadRequestException('OSS 上传失败：未返回存储 key');
    }

    if (c.ossPublicUrl) {
      // 公开读域名：直接拼接稳定可长期访问的 URL（七牛云/COS 公开读常见做法）
      return `${c.ossPublicUrl.replace(/\/+$/, '')}/${key}`;
    }
    // 未配置公开域名：使用长期(30天)预签名 URL（SDK 内部生成签名链接）
    return storage.generatePresignedUrl({ key, expireTime: 2592000 });
  }
}