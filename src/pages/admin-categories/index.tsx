import { useState, useCallback, useEffect } from 'react';
import Taro from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, FolderTree } from 'lucide-react-taro';
import { authHeader, handleUnauthorized, AdminCategory } from '../admin/shared';

export default function AdminCategories() {
  const [type, setType] = useState<'avatar' | 'wallpaper'>('avatar');
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await Network.request({
        url: '/api/admin/materials',
        header: authHeader(),
      });
      const all = ((res.data as any)?.data?.categories || []) as AdminCategory[];
      setCategories(all.filter((c) => (c.type || 'avatar') === type));
    } catch (e: any) {
      if (e?.statusCode === 401) handleUnauthorized();
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!name.trim()) {
      Taro.showToast({ title: '请填写分类名字', icon: 'none' });
      return;
    }
    try {
      await Network.request({
        url: '/api/admin/category',
        method: 'POST',
        header: authHeader(),
        data: { name: name.trim(), type },
      });
      setName('');
      Taro.showToast({ title: '已添加', icon: 'success' });
      load();
    } catch (e: any) {
      const msg = e?.data?.message || '添加失败';
      if (e?.statusCode === 401) handleUnauthorized();
      else Taro.showToast({ title: msg, icon: 'none' });
    }
  };

  const remove = (key: string) => {
    Taro.showModal({
      title: '删除分类',
      content: '确定删除这个分类吗？',
      confirmColor: '#ef4444',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await Network.request({
            url: `/api/admin/category/${key}`,
            method: 'DELETE',
            header: authHeader(),
          });
          Taro.showToast({ title: '已删除', icon: 'success' });
          load();
        } catch (e: any) {
          if (e?.statusCode === 401) handleUnauthorized();
          else Taro.showToast({ title: e?.data?.message || '删除失败', icon: 'none' });
        }
      },
    });
  };

  return (
    <View className="min-h-screen bg-slate-50">
      <View className="bg-white px-4 py-4 border-b border-slate-100">
        <Text className="block text-base font-semibold">分类管理</Text>
      </View>

      {/* 头像 / 壁纸分段 */}
      <View className="p-4">
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
                {t === 'avatar' ? '头像分类' : '壁纸分类'}
              </Text>
            </View>
          ))}
        </View>

        {/* 只需填名字 */}
        <Card className="mt-4">
          <CardContent className="p-4">
            <Text className="block text-sm font-medium mb-3">添加分类（只填名字即可）</Text>
            <View className="flex flex-row gap-2">
              <View className="flex-1 bg-slate-50 rounded-lg px-3 py-2">
                <Input
                  className="w-full bg-transparent"
                  placeholder="分类名字，如：情侣头像"
                  value={name}
                  onInput={(e) => setName(e.detail.value)}
                />
              </View>
              <Button onClick={add}>
                <Plus size={16} className="mr-1" color="#ffffff" />
                <Text>添加</Text>
              </Button>
            </View>
          </CardContent>
        </Card>

        {/* 分类列表 */}
        <Text className="block text-sm text-slate-500 mt-5 mb-3">
          {type === 'avatar' ? '头像' : '壁纸'}分类（{categories.length}）
        </Text>
        {categories.length === 0 ? (
          <View className="flex items-center justify-center py-12">
            <View className="items-center">
              <FolderTree size={36} color="#cbd5e1" />
              <Text className="block text-sm text-slate-400 mt-2">还没有分类，添加一个吧</Text>
            </View>
          </View>
        ) : (
          <View className="space-y-2">
            {categories.map((c) => (
              <Card key={c.key}>
                <CardContent className="p-3 flex items-center justify-between">
                  <Text className="block text-sm font-medium">{c.label}</Text>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(c.key)}
                  >
                    <Trash2 size={16} color="#ef4444" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
