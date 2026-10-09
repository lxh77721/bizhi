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
import { randomBytes } from 'crypto';
import { AdminService } from '@/admin/admin.service';
import { AdminGuard } from '@/admin/admin.guard';
import { MaterialsService } from '@/materials/materials.service';
import { ConfigService, AppConfig } from '@/config/config.service';
import { StatsService } from '@/stats/stats.service';
import { OssService } from '@/common/oss.service';
import { CrawlerService } from '@/crawler/crawler.service';
import { SOURCES as CRAWL_SOURCES } from '@/crawler/sources';
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
    private readonly oss: OssService,
    private readonly crawler: CrawlerService,
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

  /* ---------------------- 清空素材库（分类+素材全部重建） ---------------------- */

  @Post('purge')
  purge() {
    const data = this.materialsService.getData();
    data.categories = [];
    data.materials = [];
    this.materialsService.saveData(data);
    return { status: 'success', data: { purged: true, materialCount: 0, categoryCount: 0 } };
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

  /* ------------------------- 图片上传（对象存储 / 物理存储） ------------------------- */

  /** POST /api/admin/crawl  启动素材抓取（**立即返回**，任务在服务端后台执行）
   *  body: { source?: 'avatar'|'wallpaper', sources?: string[], categories?: string[],
   *          maxPages?: number, maxImagesPerCategory?: number, dateFrom?: string, dateTo?: string }
   *  sources 为抓取源 id 列表：dt=堆糖、nb=彼岸图网、bi=必应图搜；不传则使用全部启用的源
   *  抓取耗时通常分钟级，请用 GET /api/admin/crawl/status 轮询进度与结果 */
  @Post('crawl')
  async crawl(
    @Body()
    body: {
      source?: 'avatar' | 'wallpaper';
      sources?: string[];
      categories?: string[];
      maxPages?: number;
      maxImagesPerCategory?: number;
      dateFrom?: string;
      dateTo?: string;
    },
  ): Promise<Record<string, unknown>> {
    if (this.crawler.isRunning()) {
      throw new BadRequestException('抓取任务正在进行中，请稍后查看结果');
    }
    const result = this.crawler.start({
      source: body.source,
      sources: body.sources,
      categories: body.categories,
      maxPages: body.maxPages,
      maxImagesPerCategory: body.maxImagesPerCategory,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
    });
    return { status: 'success', data: result };
  }

  /** GET /api/admin/crawl/status  查询抓取任务进度与结果（后台轮询） */
  @Get('crawl/status')
  crawlStatus(): Record<string, unknown> {
    return { status: 'success', data: this.crawler.getTaskState() };
  }

  /** GET /api/admin/crawl/sources  可用的抓取源与各自支持的分类（供后台渲染选项） */
  @Get('crawl/sources')
  crawlSources() {
    return {
      status: 'success',
      data: {
        sources: CRAWL_SOURCES.map((s) => ({
          id: s.id,
          name: s.name,
          defaultEnabled: s.defaultEnabled !== false,
          categories: s.categories.map((c) => ({ key: c.key, label: c.label, type: c.type })),
        })),
      },
    };
  }

  /** POST /api/admin/upload  multipart: file=图片
   *  上传到已配置的对象存储（OSS）并返回可访问 URL。
   *  FaaS 部署文件系统只读，不支持本地落盘，因此必须配置 OSS。 */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  async upload(@UploadedFile() file: any) {
    if (!file || !file.buffer) throw new BadRequestException('未接收到文件');
    const originalExt = (file.originalname || 'jpg').split('.').pop() || 'jpg';
    const ext = /^[a-zA-Z0-9]{2,5}$/.test(originalExt) ? originalExt : 'jpg';
    const filename = `m-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;

    if (!this.oss.isConfigured()) {
      throw new BadRequestException('未配置对象存储（OSS），无法上传；请到后台「配置」页填写并保存对象存储信息');
    }
    const url = await this.oss.upload(
      file.buffer,
      `materials/${filename}`,
      file.mimetype || 'image/jpeg',
    );
    return { status: 'success', data: { url } };
  }

  /* ---------------- 傻瓜式：分类（只需名字） ---------------- */

  /** POST /api/admin/category  body: { name, type } */
  @Post('category')
  addSimpleCategory(@Body() body: { name?: string; type?: 'avatar' | 'wallpaper' }) {
    try {
      const cat = this.materialsService.addCategory(
        body.name || '',
        body.type === 'wallpaper' ? 'wallpaper' : 'avatar',
      );
      return { status: 'success', data: cat };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  /** DELETE /api/admin/category/:key */
  @Delete('category/:key')
  removeSimpleCategory(@Param('key') key: string) {
    try {
      this.materialsService.removeCategory(key);
      return { status: 'success' };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  /* ---------------- 傻瓜式：上传图片并入库（选分类 + 图片） ---------------- */

  /** POST /api/admin/upload-create  multipart: file + 表单 category
   *  一步完成：存到 OSS/本地 → 自动补全素材信息入库 → 返回素材（含 8 位口令码） */
  @Post('upload-create')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  async uploadAndCreate(
    @UploadedFile() file: any,
    @Body() body: { category?: string },
  ) {
    if (!file || !file.buffer) throw new BadRequestException('请选择图片');
        if (!body.category) throw new BadRequestException('请选择分类');
    const originalExt = (file.originalname || 'jpg').split('.').pop() || 'jpg';
    const ext = /^[a-zA-Z0-9]{2,5}$/.test(originalExt) ? originalExt : 'jpg';
    const filename = `m-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;

    if (!this.oss.isConfigured()) {
      throw new BadRequestException('未配置对象存储（OSS），无法上传；请到后台「配置」页填写并保存对象存储信息');
    }
    const url = await this.oss.upload(file.buffer, `materials/${filename}`, file.mimetype || 'image/jpeg');

    try {
      const item = this.materialsService.createFromUpload(body.category, url);
      return { status: 'success', data: item };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}