import { useState, useCallback, useEffect } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { View, Text, Image } from '@tarojs/components';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Images, Trash2, ImagePlus, Sparkles } from 'lucide-react-taro';
import {
  authHeader,
  handleUnauthorized,
  AdminCategory,
  AdminMaterial,
} from '../admin/shared';

export default function AdminPictures() {
  const [type, setType] = useState<'avatar' | 'wallpaper'>('avatar');
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [materials, setMaterials] = useState<AdminMaterial[]>([]);
  const [categoryKey, setCategoryKey] = useState('');
  const [uploading, setUploading] = useState(false);
  const [retitling, setRetitling] = useState(false);
  // 从抓取页返回时页面不会重新挂载，必须靠「每次显示」重新拉列表，
  // 否则刚抓进来的图片在这里看不到（数量一直显示旧值）
  const [showSeq, setShowSeq] = useState(0);
  useDidShow(() => setShowSeq((n) => n + 1));

  const load = useCallback(async () => {
    try {
      const res = await Network.request({
        url: '/api/admin/materials',
        header: authHeader(),
      });
      const data = (res.data as any)?.data;
      const cats = (data?.categories || []) as AdminCategory[];
      const mats = (data?.materials || []) as AdminMaterial[];
      const typedCats = cats.filter((c) => (c.type || 'avatar') === type);
      setCategories(typedCats);
      setMaterials(mats.filter((m) => (m.type || 'avatar') === type));
      setCategoryKey((prev) =>
        prev && typedCats.some((c) => c.key === prev) ? prev : typedCats[0]?.key || '',
      );
    } catch (e: any) {
      if (e?.statusCode === 401) handleUnauthorized();
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load, showSeq]);

  /** H5 端：XHR + FormData 直传 upload-create（绕过 Coze SW 拦截） */
  const uploadCreateH5 = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const g: any = globalThis;
      const input: any = g.document?.createElement?.('input');
      if (!input) return reject(new Error('当前环境不支持上传'));
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file: any = input.files?.[0];
        if (!file) return reject(new Error('未选择图片'));
        const form = new g.FormData();
        form.append('file', file);
        form.append('category', categoryKey);
        const xhr = new g.XMLHttpRequest();
        xhr.open('POST', '/api/admin/upload-create');
        xhr.setRequestHeader('Authorization', authHeader().Authorization);
        xhr.onload = () => {
          try {
            const body = JSON.parse(xhr.responseText);
            if (body?.data) return resolve();
            reject(new Error(body?.message || '上传失败'));
          } catch (e) {
            reject(e);
          }
        };
        xhr.onerror = () => reject(new Error('网络错误'));
        xhr.send(form);
      };
      input.click();
    });

  const upload = async () => {
    if (!categoryKey) {
      Taro.showToast({ title: '请先选择分类', icon: 'none' });
      return;
    }
    setUploading(true);
    try {
      const isMiniApp =
        Taro.getEnv() === Taro.ENV_TYPE.WEAPP || Taro.getEnv() === Taro.ENV_TYPE.TT;
      if (isMiniApp) {
        const r = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] });
        const f: any = r.tempFiles[0];
        if (!f) throw new Error('未选择图片');
        // 先放字段，文件放最后，确保后端能取到分类
        const res: any = await Network.uploadFile({
          url: '/api/admin/upload-create',
          filePath: f.path,
          name: 'file',
          formData: { category: categoryKey },
          header: authHeader(),
        });
        const body = typeof res?.data === 'string' ? JSON.parse(res.data) : res.data;
        if (!body?.data) throw new Error(body?.message || '上传失败');
      } else {
        await uploadCreateH5();
      }
      Taro.showToast({ title: '上传成功', icon: 'success' });
      load();
    } catch (e: any) {
      if (e?.statusCode === 401) handleUnauthorized();
      else Taro.showToast({ title: e?.message || '上传失败', icon: 'none' });
    } finally {
      setUploading(false);
    }
  };

  /**
   * 批量修正重复标题：把「标题=分类名 / 标题=源站ID」的老素材重新生成互不重复的标题。
   * 只改标题，不动图片与分类，可反复执行。
   */
  const retitle = async () => {
    setRetitling(true);
    try {
      const res = await Network.request({
        url: '/api/admin/materials/retitle',
        method: 'POST',
        header: authHeader(),
      });
      const r = (res.data as any)?.data || {};
      Taro.showModal({
        title: '标题已优化',
        content: `共 ${r.total ?? 0} 张图片，本次修改 ${r.changed ?? 0} 张，保留 ${r.kept ?? 0} 张。\n不同标题数：${r.uniqueBefore ?? '-'} → ${r.uniqueAfter ?? '-'}`,
        showCancel: false,
      });
      load();
    } catch (e: any) {
      if (e?.statusCode === 401) handleUnauthorized();
      else Taro.showToast({ title: e?.message || '优化失败', icon: 'none' });
    } finally {
      setRetitling(false);
    }
  };

  const remove = (id: string) => {
    Taro.showModal({
      title: '删除图片',
      content: '确定删除这张图片吗？',
      confirmColor: '#ef4444',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await Network.request({
            url: `/api/admin/materials/${id}`,
            method: 'DELETE',
            header: authHeader(),
          });
          Taro.showToast({ title: '已删除', icon: 'success' });
          load();
        } catch (e: any) {
          if (e?.statusCode === 401) handleUnauthorized();
          else Taro.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  };

  return (
    <View className="min-h-screen bg-slate-50">
      <View className="bg-white px-4 py-4 border-b border-slate-100">
        <Text className="block text-base font-semibold">图片管理</Text>
      </View>

      <View className="p-4">
        {/* 头像 / 壁纸分段 */}
        <View className="bg-slate-100 rounded-xl p-1 flex flex-row">
          {(['avatar', 'wallpaper'] as const).map((t) => (
            <View
              key={t}
              className={`flex-1 py-2 rounded-lg text-center ${
                type === t ? 'bg-white shadow-sm' : ''
              }`}
              onClick={() => setType(t)}
            >
              <Text className={`block text-sm ${type === t ? 'text-blue-500 font-medium' : 'text-slate-500'}`}>
                {t === 'avatar' ? '头像' : '壁纸'}
              </Text>
            </View>
          ))}
        </View>

        {/* 傻瓜上传：选分类 + 选图 */}
        <Card className="mt-4">
          <CardContent className="p-4">
            <Text className="block text-sm font-medium mb-3">1. 选择分类</Text>
            {categories.length === 0 ? (
              <Text className="block text-xs text-slate-400 mb-3">
                暂无分类，请先到「分类管理」添加
              </Text>
            ) : (
              <View className="flex flex-row flex-wrap gap-2 mb-4">
                {categories.map((c) => (
                  <Button
                    key={c.key}
                    size="sm"
                    variant={categoryKey === c.key ? 'default' : 'outline'}
                    onClick={() => setCategoryKey(c.key)}
                  >
                    <Text className="block">{c.label}</Text>
                  </Button>
                ))}
              </View>
            )}
            <Text className="block text-sm font-medium mb-3">2. 上传图片</Text>
            <Button
              className="w-full"
              onClick={upload}
              disabled={uploading || !categoryKey}
            >
              <ImagePlus size={18} className="mr-2" color="#ffffff" />
              <Text>{uploading ? '上传中…' : '点击选择图片并上传'}</Text>
            </Button>
          </CardContent>
        </Card>

        {/* 批量修正标题：早期抓取的图片标题是分类名（同分类几十张图标题完全一样）
            或源站 ID 乱码，搜一搜会按页面判重，这些详情页几乎拿不到收录 */}
        <Card className="mt-4">
          <CardContent className="p-4">
            <Text className="block text-sm font-medium mb-1">批量修正重复标题</Text>
            <Text className="block text-xs text-slate-400 mb-3">
              早期抓取的图片标题就是分类名（同一分类几十张图标题一模一样），还有一部分是源站
              ID 乱码。这些详情页会因为标题重复被判重、搜一搜很难收录。点一下为它们重新生成
              互不重复的标题，<Text className="text-slate-500">只改标题，不动图片和分类</Text>。
              已经有独立标题的图片会原样保留，可反复执行。
            </Text>
            <Button className="w-full" onClick={retitle} disabled={retitling}>
              <Sparkles size={18} className="mr-2" color="#ffffff" />
              <Text>{retitling ? '处理中…' : '一键优化标题'}</Text>
            </Button>
          </CardContent>
        </Card>

        {/* 图片列表 */}
        <Text className="block text-sm text-slate-500 mt-5 mb-3">
          {type === 'avatar' ? '头像' : '壁纸'}图片（{materials.length}）
        </Text>
        {materials.length === 0 ? (
          <View className="flex items-center justify-center py-12">
            <View className="items-center">
              <Images size={36} color="#cbd5e1" />
              <Text className="block text-sm text-slate-400 mt-2">还没有图片</Text>
            </View>
          </View>
        ) : (
          <View className="grid grid-cols-3 gap-2">
            {materials.map((m) => (
              <View key={m.id} className="relative group">
                <Image
                  className="w-full h-28 rounded-lg bg-slate-100"
                  src={m.thumbUrl || m.url}
                  mode="aspectFill"
                />
                <View
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black bg-opacity-50 flex items-center justify-center"
                  onClick={() => remove(m.id)}
                >
                  <Trash2 size={13} color="#ffffff" />
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
