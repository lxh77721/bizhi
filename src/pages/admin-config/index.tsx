import { useState, useCallback, useEffect } from 'react';
import Taro from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Info, Megaphone, Wand, HardDrive } from 'lucide-react-taro';
import { authHeader, handleUnauthorized, PubConfig } from '../admin/shared';

type FieldDef = { key: keyof PubConfig; label: string; hint: string; password?: boolean };

const basicFields: FieldDef[] = [
  { key: 'appName', label: '小程序名称', hint: '用于分享文案与搜一搜关键词' },
  { key: 'contactEmail', label: '侵权投诉邮箱', hint: '页面展示的投诉入口' },
  { key: 'adminPassword', label: '管理口令', hint: '管理后台登录口令，请修改默认口令', password: true },
];

const adFields: FieldDef[] = [
  { key: 'bannerAdId', label: 'Banner 广告位 ID', hint: '流量主 banner；留空则不展示' },
  { key: 'rewardAdId', label: '激励视频广告位 ID', hint: '解锁下载激励视频；留空则降级为直接下载' },
];

const genFields: FieldDef[] = [
  { key: 'aiModel', label: '生图模型', hint: '如 doubao-seedream-4-5' },
  { key: 'aiModelEndpoint', label: '生图模型地址', hint: '留空使用平台默认' },
  { key: 'aiSize', label: '生图尺寸', hint: '支持 2K / 4K' },
];

const ossFields: FieldDef[] = [
  { key: 'ossEndpoint', label: 'Endpoint 接入点', hint: '不含桶名，如 https://oss-cn-beijing.aliyuncs.com' },
  { key: 'ossBucket', label: 'Bucket 名称', hint: '存储空间名，如 img389' },
  { key: 'ossRegion', label: '区域', hint: '如 cn-beijing' },
  { key: 'ossAccessKey', label: 'AccessKey ID', hint: '阿里云 AK，仅管理端可见', password: true },
  { key: 'ossSecretKey', label: 'AccessKey Secret', hint: '阿里云 SK，仅管理端可见', password: true },
  { key: 'ossPublicUrl', label: '公网访问域名', hint: '如 img389.oss-cn-beijing.aliyuncs.com' },
];

export default function AdminConfig() {
  const [cfg, setCfg] = useState<Partial<PubConfig>>({});

  const load = useCallback(async () => {
    try {
      const res = await Network.request({
        url: '/api/admin/config',
        header: authHeader(),
      });
      setCfg((res.data as any)?.data || {});
    } catch (e: any) {
      if (e?.statusCode === 401) handleUnauthorized();
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    try {
      await Network.request({
        url: '/api/admin/config',
        method: 'PUT',
        header: authHeader(),
        data: cfg,
      });
      Taro.showToast({ title: '已保存', icon: 'success' });
    } catch (e: any) {
      if (e?.statusCode === 401) handleUnauthorized();
      else Taro.showToast({ title: '保存失败', icon: 'none' });
    }
  };

  const setVal = (key: keyof PubConfig, value: string) => {
    setCfg((prev) => ({ ...prev, [key]: value }));
  };

  const groups = [
    { title: '基础信息', icon: <Info size={18} color="#4c9df5" />, fields: basicFields },
    { title: '广告配置', icon: <Megaphone size={18} color="#f59e0b" />, fields: adFields },
    { title: '生图配置', icon: <Wand size={18} color="#8b5cf6" />, fields: genFields },
    { title: '对象存储（阿里云 OSS）', icon: <HardDrive size={18} color="#10b981" />, fields: ossFields },
  ];

  return (
    <View className="min-h-screen bg-slate-50">
      <View className="bg-white px-4 py-4 border-b border-slate-100">
        <Text className="block text-base font-semibold">系统配置</Text>
      </View>

      <View className="p-4 space-y-4">
        {groups.map((g) => (
          <Card key={g.title}>
            <CardContent className="p-4">
              <View className="flex items-center mb-4">
                <View className="mr-2">{g.icon}</View>
                <Text className="block text-sm font-semibold">{g.title}</Text>
              </View>
              <View className="space-y-4">
                {g.fields.map((f) => (
                  <View key={f.key}>
                    <Text className="block text-sm text-slate-600 mb-2">{f.label}</Text>
                    <View className="bg-slate-50 rounded-lg px-3 py-2">
                      <Input
                        className="w-full bg-transparent"
                        password={f.password}
                        value={String(cfg[f.key] ?? '')}
                        placeholder={f.hint}
                        onInput={(e) => setVal(f.key, e.detail.value)}
                      />
                    </View>
                  </View>
                ))}
                {g.title === '生图配置' ? (
                  <View>
                    <Text className="block text-sm text-slate-600 mb-2">
                      Prompt 附加约束（可选）
                    </Text>
                    <View className="bg-slate-50 rounded-lg p-3">
                      <Textarea
                        style={{ width: '100%', minHeight: '80px', backgroundColor: 'transparent' }}
                        value={cfg.aiSystemPrompt || ''}
                        placeholder="如：柔和治愈色调"
                        onInput={(e) => setVal('aiSystemPrompt', e.detail.value)}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            </CardContent>
          </Card>
        ))}

        <Button className="w-full" onClick={save}>
          <Text>保存全部配置</Text>
        </Button>
      </View>
    </View>
  );
}
