import { useEffect, useMemo, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Play } from 'lucide-react-taro';
import { authHeader, handleUnauthorized } from '../admin/shared';

/** 后端 GET /api/admin/crawl/sources 下发的分类；existing = 该分类当前已入库张数 */
interface ApiCategory {
  key: string;
  label: string;
  type: 'avatar' | 'wallpaper';
  existing: number;
}

/** 后端下发的抓取源 */
interface ApiSource {
  id: string;
  name: string;
  desc: string;
  defaultEnabled: boolean;
  categories: ApiCategory[];
}

export default function AdminCrawl() {
  // 源与分类全部由后端下发（来源是 server/src/crawler/sources 的 SOURCES 注册表），
  // 前端不再硬编码两份列表 —— 否则源里加了分类、页面选不到，或者页面选了源里没有的分类。
  const [sourceList, setSourceList] = useState<ApiSource[]>([]);
  const [sourceError, setSourceError] = useState('');
  const [selSources, setSelSources] = useState<string[]>([]);
  const [selCats, setSelCats] = useState<string[]>([]);
  const [qty, setQty] = useState('60');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<string>('');

  /** 当前选中源支持的分类并集（同 key 只保留一份） */
  const catOptions = useMemo(() => {
    const map = new Map<string, ApiCategory>();
    for (const s of sourceList) {
      if (!selSources.includes(s.id)) continue;
      for (const c of s.categories) if (!map.has(c.key)) map.set(c.key, c);
    }
    return Array.from(map.values());
  }, [sourceList, selSources]);

  const avatarCats = catOptions.filter((c) => c.type === 'avatar');
  const wallpaperCats = catOptions.filter((c) => c.type === 'wallpaper');
  const allCatKeys = catOptions.map((c) => c.key);
  const noSource = selSources.length === 0;
  const canStart = !running && !noSource && selCats.length > 0;

  const toggle = (list: string[], setList: (v: string[]) => void, key: string) => {
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  };

  // 换源后把已不在可选列表里的分类从勾选中剔除；引用不变则返回原数组，避免多余渲染
  useEffect(() => {
    setSelCats((prev) => {
      const next = prev.filter((k) => catOptions.some((c) => c.key === k));
      return next.length === prev.length ? prev : next;
    });
  }, [catOptions]);

  /**
   * 拉取源与分类。
   * mode='init'：首次加载 / 失败重试 —— 顺带把源选择重置为「默认启用」的那几个；
   * mode='silent'：抓取结束后的静默刷新 —— 只更新分类库存数字，**不动用户已做的选择**，失败也不打扰。
   */
  const loadSources = async (mode: 'init' | 'silent' = 'init') => {
    if (mode === 'init') setSourceError('');
    try {
      const res = await Network.request({
        url: '/api/admin/crawl/sources',
        header: authHeader(),
      });
      const list: ApiSource[] = (res.data as any)?.data?.sources || [];
      setSourceList(list);
      if (mode === 'init') {
        setSelSources(list.filter((s) => s.defaultEnabled).map((s) => s.id));
      }
    } catch (e: any) {
      if (e?.statusCode === 401) {
        handleUnauthorized();
        return;
      }
      if (mode === 'init') {
        setSourceError(e?.data?.message || '加载抓取源失败，请检查网络或登录状态');
      }
    }
  };

  useEffect(() => {
    loadSources('init');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // 抓完刷新各分类的「已有 N 张」（静默，不动用户的选择）
        loadSources('silent');
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
    if (noSource) {
      Taro.showToast({ title: '请先选择抓取源', icon: 'none' });
      return;
    }
    if (!selCats.length) {
      Taro.showToast({ title: '请至少勾选一个分类', icon: 'none' });
      return;
    }
    setRunning(true);
    setResult('');
    setProgress('正在启动…');
    try {
      await Network.request({
        url: '/api/admin/crawl',
        method: 'POST',
        header: authHeader(),
        data: {
          // 源与分类都显式提交：只有勾选中的分类会被抓取
          sources: selSources,
          categories: selCats,
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

  /** 分类可勾选项：显示分类名 + 当前库存，让「只增不覆盖」可见 */
  const renderCat = (c: ApiCategory) => {
    const on = selCats.includes(c.key);
    return (
      <View
        key={c.key}
        className={`rounded-lg border px-3 py-2 min-w-[104px] ${
          on ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'
        }`}
        onClick={() => toggle(selCats, setSelCats, c.key)}
      >
        <Text className={`block text-sm ${on ? 'text-sky-700' : 'text-slate-700'}`}>{c.label}</Text>
        <Text className="block text-xs text-gray-400 mt-1">
          {c.existing > 0 ? `已有 ${c.existing} 张` : '暂无'}
        </Text>
      </View>
    );
  };

  return (
    <View className="min-h-screen bg-slate-50">
      <View className="bg-white px-4 py-4 border-b border-slate-100">
        <Text className="block text-base font-semibold">抓取素材</Text>
      </View>

      <View className="p-4 space-y-4">
        {/* ---------------- 抓取源 ---------------- */}
        <Card>
          <CardContent className="p-4">
            <Text className="block text-sm font-medium mb-1">抓取源</Text>
            <Text className="block text-xs text-gray-500 mb-3">
              可多选；下方分类会随勾选的源变化。多个源抓同一分类时会自动去重
            </Text>
            {sourceError ? (
              <View className="rounded-lg bg-red-50 px-3 py-3">
                <Text className="block text-xs text-red-500">{sourceError}</Text>
                <Text className="block text-xs text-sky-600 mt-2" onClick={() => loadSources('init')}>
                  点击重试
                </Text>
              </View>
            ) : !sourceList.length ? (
              <Text className="block text-xs text-gray-400">加载中…</Text>
            ) : (
              <View className="space-y-2">
                {sourceList.map((s) => {
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
                        <Text className={`block text-sm font-medium ${on ? 'text-sky-700' : ''}`}>
                          {s.name}
                        </Text>
                        <Text className="block text-xs text-gray-400">
                          {s.categories.length} 个分类
                          {s.defaultEnabled ? '' : ' · 默认关'}
                        </Text>
                      </View>
                      {s.desc ? (
                        <Text className="block text-xs text-gray-500 mt-1">{s.desc}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </CardContent>
        </Card>

        {/* ---------------- 抓取分类 ---------------- */}
        <Card>
          <CardContent className="p-4">
            <View className="flex flex-row items-center justify-between mb-1">
              <Text className="block text-sm font-medium">抓取分类</Text>
              {catOptions.length ? (
                <View className="flex flex-row gap-3">
                  <Text className="block text-xs text-sky-600" onClick={() => setSelCats(allCatKeys)}>
                    全选
                  </Text>
                  <Text className="block text-xs text-gray-400" onClick={() => setSelCats([])}>
                    清空
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="block text-xs text-gray-500 mb-3">
              {noSource
                ? '请先在上方选择抓取源'
                : `已选 ${selCats.length} / ${catOptions.length} 个；未勾选的不抓，已有图片只做增量追加、不会被覆盖`}
            </Text>

            {noSource ? (
              <Text className="block text-xs text-gray-400">选择抓取源后，这里会列出它支持的分类</Text>
            ) : !catOptions.length ? (
              <Text className="block text-xs text-gray-400">所选源没有可抓取的分类</Text>
            ) : (
              <View className="space-y-4">
                {avatarCats.length ? (
                  <View>
                    <Text className="block text-xs text-gray-400 mb-2">头像</Text>
                    <View className="flex flex-row flex-wrap gap-2">{avatarCats.map(renderCat)}</View>
                  </View>
                ) : null}
                {wallpaperCats.length ? (
                  <View>
                    <Text className="block text-xs text-gray-400 mb-2">壁纸</Text>
                    <View className="flex flex-row flex-wrap gap-2">
                      {wallpaperCats.map(renderCat)}
                    </View>
                  </View>
                ) : null}
              </View>
            )}
          </CardContent>
        </Card>

        {/* ---------------- 抓取参数 ---------------- */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <View>
              <Text className="block text-sm font-medium mb-2">每个分类最多新增张数</Text>
              <Text className="block text-xs text-gray-500 mb-2">
                每次抓取按「本次新增」计数，已入库的图不占额度，可反复增量补图
              </Text>
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

        <Button className="w-full" onClick={start} disabled={!canStart}>
          <Play size={16} className="mr-2" color="#ffffff" />
          <Text>{running ? '抓取中…' : '开始抓取'}</Text>
        </Button>
        {!running && !canStart ? (
          <Text className="block text-xs text-gray-400 text-center">
            {noSource ? '请先选择抓取源' : '请至少勾选一个分类'}
          </Text>
        ) : null}

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
