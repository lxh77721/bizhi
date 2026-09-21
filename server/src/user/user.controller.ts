import { Controller, Get, Post, Body, Query, BadRequestException } from '@nestjs/common';
import { UserService } from '@/user/user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** POST /api/user/login  body: { clientId, nickname? } */
  @Post('login')
  login(@Body() body: { clientId?: string; nickname?: string }) {
    return { status: 'success', data: this.userService.login(body.clientId, body.nickname) };
  }

  /** GET /api/user/me?clientId=xxx */
  @Get('me')
  me(@Query('clientId') clientId?: string) {
    return { status: 'success', data: this.userService.me(clientId) };
  }

  /** POST /api/user/toggle-like  body: { clientId, materialId } */
  @Post('toggle-like')
  toggle(@Body() body: { clientId?: string; materialId?: string }) {
    return { status: 'success', data: this.userService.toggleLike(body.clientId, body.materialId) };
  }

  /** POST /api/user/mark-download  body: { clientId, materialId } */
  @Post('mark-download')
  mark(@Body() body: { clientId?: string; materialId?: string }) {
    return { status: 'success', data: this.userService.markDownload(body.clientId, body.materialId) };
  }

  /** GET /api/user/likes?clientId=xxx */
  @Get('likes')
  likes(@Query('clientId') clientId?: string) {
    return { status: 'success', data: this.userService.getLikes(clientId) };
  }

  /** GET /api/user/downloads?clientId=xxx */
  @Get('downloads')
  downloads(@Query('clientId') clientId?: string) {
    return { status: 'success', data: this.userService.getDownloads(clientId) };
  }

  /** POST /api/user/fetch-by-code  body: { code }（口令取图，公开） */
  @Post('fetch-by-code')
  fetchByCode(@Body() body: { code?: string }) {
    if (!body.code) throw new BadRequestException('口令取图码不能为空');
    return { status: 'success', data: this.userService.fetchByCode(String(body.code).trim().toLowerCase()) };
  }
}