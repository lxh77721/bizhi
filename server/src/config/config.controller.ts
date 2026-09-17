import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@/config/config.service';

@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  /** GET /api/config —— 公网配置（小程序前端启动时拉取，用于动态下发流量主 ID 等） */
  @Get()
  getPublic() {
    return { status: 'success', data: this.configService.getPublic() };
  }
}