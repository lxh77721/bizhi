import { Injectable } from '@nestjs/common';
import { ConfigService } from '@/config/config.service';
import { randomBytes } from 'crypto';

/**
 * 管理后台鉴权
 * - 口令来自 server/data/config.json 的 adminPassword（默认 admin888，后台可改）
 * - 登录成功下发会话 token（存内存），管理端接口需在 Header 携带 Bearer token
 */
@Injectable()
export class AdminService {
  private sessions = new Set<string>();

  constructor(private readonly configService: ConfigService) {}

  verifyPassword(password: string): boolean {
    return !!password && password === this.configService.get().adminPassword;
  }

  createToken(): string {
    const token = randomBytes(24).toString('hex');
    this.sessions.add(token);
    return token;
  }

  verifyToken(token?: string): boolean {
    if (!token) return false;
    return this.sessions.has(token);
  }

  revokeToken(token?: string) {
    if (token) this.sessions.delete(token);
  }
}