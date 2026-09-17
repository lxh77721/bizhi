import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminService } from '@/admin/admin.service';

/** 管理端接口守卫：校验 Header 的 `Authorization: Bearer <token>` */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly adminService: AdminService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const auth = (req.headers?.authorization as string) || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!this.adminService.verifyToken(token)) {
      throw new UnauthorizedException('未登录或登录已过期，请重新登录');
    }
    return true;
  }
}