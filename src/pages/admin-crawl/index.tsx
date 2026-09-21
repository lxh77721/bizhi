import { useState } from 'react';
import Taro from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Play } from 'lucide-react-taro';
import { authHeader, handleUnauthorized } from '../admin/shared';

const CRAWL_CAT_OPTIONS: Record<'avatar' | 'wallpaper', { key: string; label: string }[]> = {
  avatar: [
    { key: 'weixintouxiang', label: '微信头像' },
    { key: 'nanshengtouxiang', label: '男生头像' },
    { key: 'nvshengtouxiang', label: '女生头像' },
    { key: 'douyintouxiang', label: '抖音头像' },
  ],
  wallpaper: [
    { key: '暗黑', label: '暗黑' },
    { key: '抽象', label: '抽象' },
    { key: '简约', label: '简约' },
    { key: '可爱', label: '可爱' },
    { key: '文字', label: '文字' },
    { key: '艺术', label: '艺术' },
    { key: '苹果', label: '苹果' },
  ],
};

export default function AdminCrawl() {
  const [source, setSource] = useState<'avatar' | 'wallpaper'>('avatar');
  const [selCats, setSelCats] = useState<string[]>([]);
  const [qty, setQty] = useState('40');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string>('');

  const toggleCat = (key: string) => {
    setSelCats((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const start = async () => {
    setRunning(true);
    setResult('');
    try {
      const res = await Network.request({
        url: '/api/admin/crawl',
        method: 'POST',
        header: authHeader(),
        data: {
          source,
          categories: selCats.length ? selCats : undefined,
          maxImagesPerCategory: Number(qty) || 40,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      });
      const d = (res.data as any)?.data as any;
      const label = source === 'avatar' ? '头像源' : '壁纸源';
      setResult(
        `${label}：新增 ${d?.created ?? 0} 张，跳过 ${d?.skipped ?? 0}，失败 ${d?.failed ?? 0}`,
      );
    } catch (e: any) {
      if (e?.statusCode === 401) handleUnauthorized();
      else Taro.showToast({ title: e?.data?.message || '抓取失败', icon: 'none' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <View className="min-h-screen bg-slate-50">
      <View className="bg-white px-4 py-4 border-b border-slate-100">
        <Text className="block text-base font-semibold">抓取素材</Text>
      </View>

      <View className="p-4 space-y-4">
        <Card>
          <CardContent className="p-4">
            <Text className="block text-sm font-medium mb-3">选择素材源</Text>
            <View className="flex flex-row gap-2">
              {(['avatar', 'wallpaper'] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={source === s ? 'default' : 'outline'}
                  onClick={() => {
                    setSource(s);
                    setSelCats([]);
                  }}
                >
                  <Text className="block">{s === 'avatar' ? '头像源' : '壁纸源'}</Text>
                </Button>
              ))}
            </View>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <Text className="block text-sm font-medium mb-3">
              选择分类（不选则抓取全部）
            </Text>
            <View className="flex flex-row flex-wrap gap-2">
              {CRAWL_CAT_OPTIONS[source].map((c) => (
                <Button
                  key={c.key}
                  size="sm"
                  variant={selCats.includes(c.key) ? 'default' : 'outline'}
                  onClick={() => toggleCat(c.key)}
                >
                  <Text className="block">{c.label}</Text>
                </Button>
              ))}
            </View>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <View>
              <Text className="block text-sm font-medium mb-2">每个分类抓取张数</Text>
              <View className="bg-slate-50 rounded-lg px-3 py-2">
                <Input
                  className="w-full bg-transparent"
                  type="number"
                  value={qty}
                  onInput={(e) => setQty((e as any).detail?.value || '40')}
                />
              </View>
            </View>
            {source === 'avatar' ? (
              <View>
                <Text className="block text-sm font-medium mb-2">
                  日期范围（可选，格式 YYYY-MM-DD）
                </Text>
                <View className="flex flex-row gap-2">
                  <View className="flex-1 bg-slate-50 rounded-lg px-3 py-2">
                    <Input
                      className="w-full bg-transparent"
                      placeholder="起始"
                      value={dateFrom}
                      onInput={(e) => setDateFrom((e as any).detail?.value || '')}
                    />
                  </View>
                  <View className="flex-1 bg-slate-50 rounded-lg px-3 py-2">
                    <Input
                      className="w-full bg-transparent"
                      placeholder="结束"
                      value={dateTo}
                      onInput={(e) => setDateTo((e as any).detail?.value || '')}
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </CardContent>
        </Card>

        <Button className="w-full" onClick={start} disabled={running}>
          <Play size={16} className="mr-2" color="#ffffff" />
          <Text>{running ? '抓取中…' : '开始抓取'}</Text>
        </Button>

        {result ? (
          <Card>
            <CardContent className="p-4">
              <Text className="block text-sm text-center">{result}</Text>
            </CardContent>
          </Card>
        ) : null}
      </View>
    </View>
  );
}
