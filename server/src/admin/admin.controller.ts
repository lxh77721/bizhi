import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { AdminService } from '@/admin/admin.service';
import { AdminGuard } from '@/admin/admin.guard';
import { MaterialsService } from '@/materials/materials.service';
import { ConfigService, AppConfig } from '@/config/config.service';
import { StatsService } from '@/stats/stats.service';
import { MaterialItem, Category } from '@/materials/materials.data';

/** 登录 / 注销（无需守卫） */
@Controller('admin')
export class AdminAuthController {
  constructor(private readonly adminService: AdminService) {}

  /** POST /api/admin/login  body: { password } */
  @Post('login')
  login(@Body() body: { password?: string }) {
    if (!this.adminService.verifyPassword(body.password || '')) {
      throw new UnauthorizedException('口令错误');
    }
    return { status: 'success', data: { token: this.adminService.createToken() } };
  }

  /** POST /api/admin/logout */
  @Post('logout')
  logout(@Headers('authorization') auth?: string) {
    const token = (auth || '').startsWith('Bearer ') ? (auth as string).slice(7) : '';
    this.adminService.revokeToken(token || undefined);
    return { status: 'success' };
  }
}

/** 管理后台业务接口（需要 Bearer token） */
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly configService: ConfigService,
    private readonly statsService: StatsService,
  ) {}

  /* ------------------------------ 统计看板 ------------------------------ */

  /** GET /api/admin/stats */
  @Get('stats')
  stats() {
    const data = this.materialsService.getData();
    return {
      status: 'success',
      data: {
        ...this.statsService.get(),
        materialCount: data.materials.length,
        categoryCount: data.categories.length,
      },
    };
  }

  /* ------------------------- 素材管理 ------------------------- */

  @Get('materials')
  listMaterials() {
    const data = this.materialsService.getData();
    return { status: 'success', data: { materials: data.materials, categories: data.categories } };
  }

  @Post('materials')
  createMaterial(@Body() body: MaterialItem) {
    const data = this.materialsService.getData();
    if (!body.id) throw new BadRequestException('缺少素材 id');
    if (data.materials.some((m) => m.id === body.id)) {
      throw new BadRequestException(`素材 id 已存在: ${body.id}`);
    }
    const item: MaterialItem = {
      id: body.id,
      title: body.title || body.id,
      category: body.category || 'girl',
      url: body.url,
      thumbUrl: body.thumbUrl || body.url,
      width: body.width || 1024,
      height: body.height || 1024,
      tags: body.tags || [],
    };
    data.materials.unshift(item);
    this.materialsService.saveData(data);
    return { status: 'success', data: item };
  }

  @Put('materials/:id')
  updateMaterial(@Param('id') id: string, @Body() body: Partial<MaterialItem>) {
    const data = this.materialsService.getData();
    const idx = data.materials.findIndex((m) => m.id === id);
    if (idx < 0) throw new NotFoundException(`素材不存在: ${id}`);
    data.materials[idx] = { ...data.materials[idx], ...body, id };
    this.materialsService.saveData(data);
    return { status: 'success', data: data.materials[idx] };
  }

  @Delete('materials/:id')
  deleteMaterial(@Param('id') id: string) {
    const data = this.materialsService.getData();
    const next = data.materials.filter((m) => m.id !== id);
    if (next.length === data.materials.length) throw new NotFoundException(`素材不存在: ${id}`);
    data.materials = next;
    this.materialsService.saveData(data);
    return { status: 'success' };
  }

  /* ------------------------- 分类管理 ------------------------- */

  @Post('categories')
  createCategory(@Body() body: Category) {
    const data = this.materialsService.getData();
    if (!body.key || !body.label) throw new BadRequestException('分类 key 与 label 不能为空');
    if (data.categories.some((c) => c.key === body.key)) {
      throw new BadRequestException(`分类 key 已存在: ${body.key}`);
    }
    data.categories.push({
      key: body.key,
      label: body.label,
      icon: body.icon || '',
    });
    this.materialsService.saveData(data);
    return { status: 'success', data: { key: body.key, label: body.label } };
  }

  @Put('categories/:key')
  updateCategory(@Param('key') key: string, @Body() body: Partial<Category>) {
    const data = this.materialsService.getData();
    const idx = data.categories.findIndex((c) => c.key === key);
    if (idx < 0) throw new NotFoundException(`分类不存在: ${key}`);
    data.categories[idx] = { ...data.categories[idx], ...body, key };
    this.materialsService.saveData(data);
    return { status: 'success' };
  }

  @Delete('categories/:key')
  deleteCategory(@Param('key') key: string) {
    const data = this.materialsService.getData();
    const idx = data.categories.findIndex((c) => c.key === key);
    if (idx < 0) throw new NotFoundException(`分类不存在: ${key}`);
    data.categories.splice(idx, 1);
    // 该分类下素材保留（category 字段不变），避免误删素材
    this.materialsService.saveData(data);
    return { status: 'success' };
  }

  /* ------------------------- 全局配置 ------------------------- */

  @Get('config')
  getConfig() {
    return { status: 'success', data: this.configService.get() };
  }

  @Put('config')
  updateConfig(@Body() body: Partial<AppConfig>) {
    const data = this.configService.update(body);
    return { status: 'success', data };
  }

  /* ------------------------- 图片上传（物理存储） ------------------------- */

  /** POST /api/admin/upload  multipart: file=图片  —— 保存到 server/public/materials */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  upload(@UploadedFile() file: any) {
    if (!file || !file.buffer) throw new BadRequestException('未接收到文件');
    const originalExt = (file.originalname || 'jpg').split('.').pop() || 'jpg';
    const ext = /^[a-zA-Z0-9]{2,5}$/.test(originalExt) ? originalExt : 'jpg';
    const filename = `m-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
    const dir = path.resolve(process.cwd(), 'server', 'public', 'materials');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), file.buffer);
    return { status: 'success', data: { url: `/static/materials/${filename}` } };
  }
}