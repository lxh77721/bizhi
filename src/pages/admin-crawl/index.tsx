import { useEffect, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Play } from 'lucide-react-taro';
import { authHeader, handleUnauthorized } from '../admin/shared';

/** 可选抓取源（与 server/src/crawler/sources/index.ts 的 SOURCES 对应） */
const CRAWL_SOURCE_OPTIONS: { id: string; label: string; desc: string; on: boolean }[] = [
  { id: 'dt', label: '堆糖', desc: '主源 · 头像+壁纸 · 量大 · 原图 1080×2340', on: true },
  { id: 'nb', label: '彼岸图网', desc: '4K竖屏壁纸 · 自带真实中文标题', on: true },
  { id: 'bi', label: '必应图搜', desc: '全网补充 · 噪音较多，按需启用', on: false },
];

const CRAWL_CAT_OPTIONS: Record<'avatar' | 'wallpaper', { key: string; label: string }[]> = {
  avatar: [
    { key: 'avatar_weixintouxiang', label: '微信头像' },
    { key: 'avatar_nvshengtouxiang', label: '女生头像' },
    { key: 'avatar_nanshengtouxiang', label: '男生头像' },
    { key: 'avatar_douyintouxiang', label: '抖音头像' },
    { key: 'avatar_qinglvtouxiang', label: '情侣头像' },
    { key: 'avatar_guimitouxiang', label: '闺蜜头像' },
    { key: 'avatar_keaitouxiang', label: '可爱头像' },
    { key: 'avatar_dongmantouxiang', label: '动漫头像' },
    { key: 'avatar_insfengtouxiang', label: 'ins风头像' },
    { key: 'avatar_gaojigantouxiang', label: '高级感头像' },
    { key: 'avatar_shadiatouxiang', label: '沙雕头像' },
    { key: 'avatar_emotouxiang', label: 'emo头像' },
  ],
  wallpaper: [
    { key: 'wallpaper_治愈', label: '治愈' },
    { key: 'wallpaper_暗黑', label: '暗黑' },
    { key: 'wallpaper_简约', label: '简约' },
    { key: 'wallpaper_文字', label: '文字' },
    { key: 'wallpaper_可爱', label: '可爱' },
    { key: 'wallpaper_艺术', label: '艺术' },
    { key: 'wallpaper_风景', label: '风景' },
    { key: 'wallpaper_动漫', label: '动漫' },
    { key: 'wallpaper_抽象', label: '抽象' },
    { key: 'wallpaper_苹果', label: '苹果' },
    { key: 'wallpaper_4K', label: '4K' },
  ],
};

export default function AdminCrawl() {
  const [source, setSource] = useState<'avatar' | 'wallpaper'>('avatar');
  const [selSources, setSelSources] = useState<string[]>([]);
  const [selCats, setSelCats] = useState<string[]>([]);
  const [qty, setQty] = useState('60');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<string>('');

  const toggle = (list: string[], setList: (v: string[]) => void, key: string) => {
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  };

  // 抓取是分钟级任务（多源 × 多分类 × 逐张下载上传），远超小程序 60s 请求超时，
  // 因此后端改为「立即返回 + 后台执行」，这里用轮询读取进度与结果。
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const poll = () => {
    stopPolling();
    timerRef.current = setInterval(async () => {
      try {
        const res = await Network.request({
          url: '/api/admin/crawl/status',
          header: authHeader(),
        });
        const d = (res.data as any)?.data;
        if (!d) return;

        if (d.running) {
          setProgress(d.progress || '抓取中…');
          return;
        }

        // 任务已结束
        stopPolling();
        setRunning(false);
        setProgress('');
        if (d.error) {
          setResult(`抓取失败：${d.error}`);
          return;
        }
        const r = d.result;
        const head = `新增 ${r?.created ?? 0} 张，跳过 ${r?.skipped ?? 0}，失败 ${r?.failed ?? 0}`;
        setResult(r?.detail ? `${head}\n${r.detail}` : head);
      } catch (e: any) {
        if (e?.statusCode === 401) {
          stopPolling();
          setRunning(false);
          handleUnauthorized();
        }
        // 其它抖动忽略，下一轮继续
      }
    }, 3000);
  };

  // 进入页面时若已有任务在后台跑（例如中途退出后重进），直接接管轮询
  useEffect(() => {
    (async () => {
      try {
        const res = await Network.request({
          url: '/api/admin/crawl/status',
          header: authHeader(),
        });
        const d = (res.data as any)?.data;
        if (d?.running) {
          setRunning(true);
          setProgress(d.progress || '抓取中…');
          poll();
        }
      } catch {
        /* 忽略登录态/网络异常 */
      }
    })();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setRunning(true);
    setResult('');
    setProgress('正在启动…');
    try {
      await Network.request({
        url: '/api/admin/crawl',
        method: 'POST',
        header: authHeader(),
        data: {
          source,
          // 不选源 = 使用全部启用的源
          sources: selSources.length ? selSources : undefined,
          categories: selCats.length ? selCats : undefined,
          maxImagesPerCategory: Number(qty) || 60,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      });
      setProgress('抓取中…');
      poll();
    } catch (e: any) {
      setRunning(false);
      setProgress('');
      if (e?.statusCode === 401) handleUnauthorized();
      else Taro.showToast({ title: e?.data?.message || '抓取启动失败', icon: 'none' });
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
            <Text className="block text-sm font-medium mb-3">抓取频道</Text>
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
                  <Text className="block">{s === 'avatar' ? '头像频道' : '壁纸频道'}</Text>
                </Button>
              ))}
            </View>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <Text className="block text-sm font-medium mb-1">抓取源站点</Text>
            <Text className="block text-xs text-gray-500 mb-3">
              不选 = 只跑默认源；多个源会依次抓取并自动去重
            </Text>
            <View className="space-y-2">
              {CRAWL_SOURCE_OPTIONS.map((s) => {
                const on = selSources.includes(s.id);
                return (
                  <View
                    key={s.id}
                    className={`rounded-lg border px-3 py-2 ${
                      on ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'
                    }`}
                    onClick={() => toggle(selSources, setSelSources, s.id)}
                  >
                    <View className="flex flex-row items-center justify-between">
                      <Text className="block text-sm font-medium">{s.label}</Text>
                      {s.on ? (
                        <Text className="block text-xs text-sky-500">默认</Text>
                      ) : (
                        <Text className="block text-xs text-gray-400">可选</Text>
                      )}
                    </View>
                    <Text className="block text-xs text-gray-500 mt-1">{s.desc}</Text>
                  </View>
                );
              })}
            </View>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <Text className="block text-sm font-medium mb-1">选择分类</Text>
            <Text className="block text-xs text-gray-500 mb-3">不选则抓取全部</Text>
            <View className="flex flex-row flex-wrap gap-2">
              {CRAWL_CAT_OPTIONS[source].map((c) => (
                <Button
                  key={c.key}
                  size="sm"
                  variant={selCats.includes(c.key) ? 'default' : 'outline'}
                  onClick={() => toggle(selCats, setSelCats, c.key)}
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
              <Text className="block text-xs text-gray-500 mb-2">已入库的张数会占用额度</Text>
              <View className="bg-slate-50 rounded-lg px-3 py-2">
                <Input
                  className="w-full bg-transparent"
                  type="number"
                  value={qty}
                  onInput={(e) => setQty((e as any).detail?.value || '60')}
                />
              </View>
            </View>
            <View>
              <Text className="block text-sm font-medium mb-2">
                日期范围（可选，格式 YYYY-MM-DD）
              </Text>
              <Text className="block text-xs text-gray-500 mb-2">
                仅对能拿到发布时间的源生效（彼岸图网、堆糖）
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
          </CardContent>
        </Card>

        <Button className="w-full" onClick={start} disabled={running}>
          <Play size={16} className="mr-2" color="#ffffff" />
          <Text>{running ? '抓取中…' : '开始抓取'}</Text>
        </Button>

        {running ? (
          <Card>
            <CardContent className="p-4">
              <Text className="block text-xs text-sky-600 text-center">
                任务已在服务端后台执行，可放心退出本页
              </Text>
              <Text className="block text-sm text-center mt-1">{progress || '抓取中…'}</Text>
            </CardContent>
          </Card>
        ) : null}

        {result ? (
          <Card>
            <CardContent className="p-4">
              {result.split('\n').map((line, i) => (
                <Text key={i} className="block text-sm text-center leading-6">
                  {line}
                </Text>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </View>
    </View>
  );
}
