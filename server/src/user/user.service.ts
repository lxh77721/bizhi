import { Injectable, BadRequestException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { FileStore } from '@/common/file-store.service';
import { MaterialsService } from '@/materials/materials.service';
import { MaterialItem } from '@/materials/materials.data';
import { UsersFile, UserRecord } from '@/user/user.data';

const USERS_FILE = 'users.json';

/**
 * 用户端业务（轻量、无密码的身份：clientId 由前端生成并持久化）
 * - 点赞/下载/口令取图绑定 clientId 身份
 * - 数据持久化到 server/data/users.json
 */
@Injectable()
export class UserService implements OnModuleInit {
  private cache: UsersFile;

  constructor(
    private readonly store: FileStore,
    private readonly materials: MaterialsService,
  ) {
    // 缓存延迟到 onModuleInit 初始化，确保 FileStore 已从数据库加载持久化数据
    this.cache = { users: {} };
  }

  onModuleInit() {
    this.cache = this.store.read<UsersFile>(USERS_FILE, { users: {} });
  }

  /** 素材 → 存储用快照 */
  private snapshot(m: MaterialItem): MaterialItem {
    return {
      id: m.id,
      code: m.code,
      title: m.title,
      category: m.category,
      url: m.url,
      thumbUrl: m.thumbUrl,
      width: m.width,
      height: m.height,
      tags: m.tags || [],
      type: m.type,
    };
  }

  private user(userId: string): UserRecord {
    if (!this.cache.users[userId]) {
      this.cache.users[userId] = { userId, createdAt: Date.now(), likes: [], downloads: [] };
    }
    return this.cache.users[userId];
  }

  private requireId(clientId?: string): string {
    if (!clientId || !clientId.trim()) throw new BadRequestException('缺少用户身份');
    return clientId.trim();
  }

  /** 登录/进入：幂等创建用户并返回其数据 */
  login(clientId?: string, nickname?: string) {
    const id = this.requireId(clientId);
    const u = this.user(id);
    if (nickname && nickname.trim()) u.nickname = nickname.trim().slice(0, 20);
    this.save();
    return { user: { userId: u.userId, nickname: u.nickname || '' }, likes: u.likes, downloads: u.downloads };
  }

  me(clientId?: string) {
    const u = this.user(this.requireId(clientId));
    return { user: { userId: u.userId, nickname: u.nickname || '' }, likes: u.likes, downloads: u.downloads };
  }

  /** 点赞/取消点赞 */
  toggleLike(clientId?: string, materialId?: string) {
    const id = this.requireId(clientId);
    if (!materialId) throw new BadRequestException('缺少素材');
    const m = this.materials.findById(materialId);
    if (!m) throw new NotFoundException('素材不存在');
    const u = this.user(id);
    const idx = u.likes.findIndex((l) => l.id === materialId);
    let liked = false;
    if (idx >= 0) {
      u.likes.splice(idx, 1);
    } else {
      u.likes.unshift(this.snapshot(m));
      liked = true;
    }
    this.save();
    return { liked, likes: u.likes };
  }

  /** 记录一次下载 */
  markDownload(clientId?: string, materialId?: string) {
    const id = this.requireId(clientId);
    if (!materialId) throw new BadRequestException('缺少素材');
    const m = this.materials.findById(materialId);
    if (!m) throw new NotFoundException('素材不存在');
    const u = this.user(id);
    if (!u.downloads.some((d) => d.id === materialId)) {
      u.downloads.unshift(this.snapshot(m));
      this.save();
    }
    return { downloads: u.downloads };
  }

  getLikes(clientId?: string) {
    return { likes: this.user(this.requireId(clientId)).likes };
  }

  getDownloads(clientId?: string) {
    return { downloads: this.user(this.requireId(clientId)).downloads };
  }

  /** 口令取图：通过 8 位口令码获取素材 */
  fetchByCode(code: string) {
    const m = this.materials.findByCode(code);
    if (!m) throw new NotFoundException(`口令取图码无效：${code}`);
    return { material: this.snapshot(m) };
  }

  private save() {
    this.store.write(USERS_FILE, this.cache);
  }
}