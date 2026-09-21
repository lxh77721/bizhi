import { MaterialItem } from '@/materials/materials.data';

/** 单个用户记录（点赞/下载以素材快照形式持久化，便于脱离素材库也能展示） */
export interface UserRecord {
  userId: string;
  nickname?: string;
  createdAt: number;
  likes: MaterialItem[];
  downloads: MaterialItem[];
}

export interface UsersFile {
  users: Record<string, UserRecord>;
}