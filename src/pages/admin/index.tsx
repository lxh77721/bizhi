import { useState, useCallback, useEffect } from 'react';
import Taro from '@tarojs/taro';
import { View, Text, ScrollView, Image } from '@tarojs/components';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Settings, Images, LayoutDashboard, LogOut, Upload, Download, Trash2 } from 'lucide-react-taro';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

/** 抓取弹窗：可选源与分类 */
const CRAWL_SOURCES = [
  { key: 'avatar', label: '头像源' },
  { key: 'wallpaper', label: '壁纸源' },
] as const;

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

const TOKEN_KEY = 'admin_token';

interface Material {
  id: string;
  title: string;
  category: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  tags: string[];
}
interface Category {
  key: string;
  label: string;
  icon?: string;
}
interface Stats {
  materialCount: number;
  categoryCount: number;
  generateCount: number;
  unlockCount: number;
}
interface PubConfig {
  appName: string;
  contactEmail: string;
  adminPassword: string;
  bannerAdId: string;
  rewardAdId: string;
  aiModel: string;
  aiModelEndpoint: string;
  aiSize: string;
  aiSystemPrompt: string;
  ossEndpoint: string;
  ossBucket: string;
  ossRegion: string;
  ossAccessKey: string;
  ossSecretKey: string;
  ossPublicUrl: string;
}

function authHeader() {
  const token = Taro.getStorageSync(TOKEN_KEY);
  return { Authorization: `Bearer ${token}` };
}

export default function Admin() {
  const [authState, setAuthState] = useState<'checking' | 'authed' | 'unauthed'>('checking');
  const [pwd, setPwd] = useState('');
  const [loginErr, setLoginErr] = useState('');

  // 进入时向后端校验登录态：即使本地残留 token，也须经后端验证有效；否则清除并回到登录页
  useEffect(() => {
    if (!Taro.getStorageSync(TOKEN_KEY)) {
      setAuthState('unauthed');
      return;
    }
    Network.request({ url: '/api/admin/stats', header: authHeader() })
      .then(() => setAuthState('authed'))
      .catch(() => {
        Taro.removeStorageSync(TOKEN_KEY);
        setAuthState('unauthed');
      });
  }, []);

  // 登录
  const doLogin = useCallback(async () => {
    try {
      const res = await Network.request({
        url: '/api/admin/login',
        method: 'POST',
        data: { password: pwd },
      });
      const data = (res.data as any)?.data;
      Taro.setStorageSync(TOKEN_KEY, data.token);
      setAuthState('authed');
      setLoginErr('');
    } catch (err: any) {
      setLoginErr((err?.data && (err.data as any)?.message) || '登录失败，请检查口令');
    }
  }, [pwd]);

  if (authState === 'checking') {
    return (
      <View className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Text className="block text-slate-500">正在校验登录…</Text>
      </View>
    );
  }

  if (authState === 'unauthed') {
    return (
      <View className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="p-6">
            <Text className="block text-lg font-semibold text-center mb-1">头像壁纸 · 管理后台</Text>
            <Text className="block text-sm text-slate-500 text-center mb-5">请输入管理口令登录</Text>
            <View className="mb-4">
              <Input
                className="w-full"
                password
                placeholder="管理口令"
                value={pwd}
                onInput={(e) => setPwd(e.detail.value)}
              />
            </View>
            {loginErr ? (
              <Text className="block text-sm text-red-500 mb-3">{loginErr}</Text>
            ) : null}
            <Button className="w-full" onClick={doLogin} size="lg">
              <Text>登 录</Text>
            </Button>
          </CardContent>
        </Card>
      </View>
    );
  }

  return (
    <AdminPanel
      onLogout={() => {
        Taro.removeStorageSync(TOKEN_KEY);
        setAuthState('unauthed');
      }}
    />
  );
}

function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState('stats');
  const logout = () => {
    Network.request({ url: '/api/admin/logout', method: 'POST', header: authHeader() });
    Taro.removeStorageSync(TOKEN_KEY);
    onLogout();
  };
  const [crawling, setCrawling] = useState(false);
  const [crawlOpen, setCrawlOpen] = useState(false);

  /** 清空素材库（分类+素材全部重建，重新抓取后恢复） */
  const confirmPurge = useCallback(() => {
    Taro.showModal({
      title: '清空素材库',
      content: '将清空本地全部分类与素材，之后点击「抓取素材」会从网站同步分类并重新抓图。确认清空？',
      confirmText: '清空',
      confirmColor: '#ef4444',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await Network.request({ url: '/api/admin/purge', method: 'POST', header: authHeader() });
          Taro.showToast({ title: '已清空，请重新抓取', icon: 'success' });
          setTimeout(() => Taro.redirectTo({ url: '/pages/admin/index' }), 600);
        } catch (e) {
          console.error('清空失败', e);
          Taro.showToast({ title: '清空失败', icon: 'none' });
        }
      },
    });
  }, []);

  const [crawlSource, setCrawlSource] = useState<'avatar' | 'wallpaper'>('avatar');
  const [selCats, setSelCats] = useState<string[]>([]);
  const [qty, setQty] = useState('40');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const toggleCat = (k: string) =>
    setSelCats((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  /** 按弹窗参数触发抓取 */
  const runCrawl = useCallback(async () => {
    if (crawling) return;
    setCrawling(true);
    try {
      const cats = selCats.length
        ? selCats
        : CRAWL_CAT_OPTIONS[crawlSource].map((c) => c.key);
      const body: Record<string, unknown> = {
        source: crawlSource,
        categories: cats,
        maxPages: crawlSource === 'wallpaper' ? 10 : 3,
        maxImagesPerCategory: Number(qty) || 40,
      };
      if (dateFrom.trim()) body.dateFrom = dateFrom.trim();
      if (dateTo.trim()) body.dateTo = dateTo.trim();
      Taro.showToast({ title: '开始抓取…', icon: 'none' });
      const res = await Network.request({
        url: '/api/admin/crawl',
        method: 'POST',
        header: authHeader(),
        data: body,
      });
      const d = (res.data as any)?.data;
      const n = d?.created ?? 0;
      setCrawlOpen(false);
      Taro.showToast({
        title: n > 0 ? `新增 ${n} 张${crawlSource === 'wallpaper' ? '壁纸' : '头像'}` : '没有新增素材（已抓取过）',
        icon: n > 0 ? 'success' : 'none',
      });
    } catch (e: any) {
      Taro.showToast({ title: (e?.data as any)?.message || '抓取失败，请查看后端日志', icon: 'none' });
    } finally {
      setCrawling(false);
    }
  }, [crawling, crawlSource, selCats, qty, dateFrom, dateTo]);

  return (
    <View className="min-h-screen bg-slate-100">
      {/* 顶栏 */}
      <View className="bg-white px-4 py-3 flex items-center justify-between border-b border-slate-200">
        <Text className="text-base font-semibold">管理后台</Text>
        <View style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Button size="sm" variant="outline" onClick={() => setCrawlOpen(true)} disabled={crawling}>
            <Download size={15} className="mr-1" color={crawling ? '#9ca3af' : '#4c9df5'} />
            <Text>{crawling ? '抓取中…' : '抓取素材'}</Text>
          </Button>
          <Button size="sm" variant="outline" onClick={confirmPurge}>
            <Trash2 size={15} className="mr-1" color="#ef4444" />
            <Text>清空数据</Text>
          </Button>
          <Button size="sm" variant="ghost" onClick={logout}>
            <LogOut size={16} className="mr-1" color="#4c9df5" />
            <Text>退出</Text>
          </Button>
        </View>
      </View>

      {/* 抓取素材弹窗 */}
      <Dialog open={crawlOpen} onOpenChange={setCrawlOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>抓取素材</DialogTitle>
          </DialogHeader>
          <View className="p-2 space-y-5">
            <View>
              <Text className="block text-sm font-medium mb-2">素材源</Text>
              <View className="flex flex-row gap-2 flex-wrap">
                {CRAWL_SOURCES.map((s) => (
                  <Button
                    key={s.key}
                    size="sm"
                    variant={crawlSource === s.key ? 'default' : 'outline'}
                    onClick={() => {
                      setCrawlSource(s.key);
                      setSelCats([]);
                    }}
                  >
                    <Text className="block">{s.label}</Text>
                  </Button>
                ))}
              </View>
            </View>

            <View>
              <Text className="block text-sm font-medium mb-2">分类（点击多选，不选则抓全部）</Text>
              <View className="flex flex-row gap-2 flex-wrap">
                {CRAWL_CAT_OPTIONS[crawlSource].map((c) => (
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
            </View>

            <View>
              <Text className="block text-sm font-medium mb-2">每个分类抓取张数</Text>
              <Input
                type="number"
                value={qty}
                onInput={(e) => setQty((e as any).detail?.value || '40')}
                placeholder="如 40"
              />
            </View>

            <View>
              <Text className="block text-sm font-medium mb-2">日期范围（可选，仅头像源生效，格式 YYYY-MM-DD）</Text>
              <View className="flex flex-row gap-2">
                <Input
                  className="flex-1"
                  placeholder="起始，如 2024-01-01"
                  value={dateFrom}
                  onInput={(e) => setDateFrom((e as any).detail?.value || '')}
                />
                <Input
                  className="flex-1"
                  placeholder="结束"
                  value={dateTo}
                  onInput={(e) => setDateTo((e as any).detail?.value || '')}
                />
              </View>
            </View>
          </View>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCrawlOpen(false)}>
              <Text>取消</Text>
            </Button>
            <Button onClick={runCrawl} disabled={crawling}>
              <Text>{crawling ? '抓取中…' : '开始抓取'}</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={setTab}>
        <View className="bg-white px-2 py-2 flex border-b border-slate-100 sticky top-0 z-10">
          <TabsList className="w-full grid-cols-3 gap-1">
            <TabsTrigger value="stats">
              <LayoutDashboard size={15} className="mr-1" color="#4c9df5" />
              <Text>看板</Text>
            </TabsTrigger>
            <TabsTrigger value="materials">
              <Images size={15} className="mr-1" color="#4c9df5" />
              <Text>素材</Text>
            </TabsTrigger>
            <TabsTrigger value="config">
              <Settings size={15} className="mr-1" color="#4c9df5" />
              <Text>配置</Text>
            </TabsTrigger>
          </TabsList>
        </View>

        <ScrollView scrollY className="h-[calc(100vh-120px)]">
          <TabsContent value="stats">
            <StatsTab />
          </TabsContent>
          <TabsContent value="materials">
            <MaterialsTab />
          </TabsContent>
          <TabsContent value="config">
            <ConfigTab />
          </TabsContent>
        </ScrollView>
      </Tabs>
    </View>
  );
}

/* ----------------------------- 看板 ----------------------------- */
function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const load = useCallback(async () => {
    const res = await Network.request({ url: '/api/admin/stats', header: authHeader() });
    setStats((res.data as any)?.data as Stats);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const cards = [
    { label: '素材总数', value: stats?.materialCount ?? '-', color: 'text-blue-500' },
    { label: '分类数', value: stats?.categoryCount ?? '-', color: 'text-emerald-500' },
    { label: ' 生成次数', value: stats?.generateCount ?? '-', color: 'text-violet-500' },
    { label: '解锁下载次数', value: stats?.unlockCount ?? '-', color: 'text-amber-500' },
  ];

  return (
    <View className="p-4">
      <Text className="block text-sm text-slate-500 mb-3">核心指标（概览）</Text>
      <View className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <Text className={`block text-2xl font-bold ${c.color}`}>{c.value}</Text>
              <Text className="block text-sm text-slate-500 mt-1">{c.label}</Text>
            </CardContent>
          </Card>
        ))}
      </View>
      <Card className="mt-4">
        <CardContent className="p-4">
          <Text className="block text-sm font-medium mb-1">说明</Text>
          <Text className="block text-xs text-slate-500 leading-relaxed">
            素材与分类的管理请切换到「素材」「分类」标签；流量主广告位 ID、 模型等在「配置」标签维护。
            统计次数包含  生成与激励视频解锁下载两个维度。
          </Text>
        </CardContent>
      </Card>
    </View>
  );
}

/* ----------------------------- 素材管理 ----------------------------- */
function MaterialsTab() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Partial<Material>>({ tags: [] });
  const [autoId, setAutoId] = useState('');
  const [tagInput, setTagInput] = useState('');

  const load = useCallback(async () => {
    const res = await Network.request({ url: '/api/admin/materials', header: authHeader() });
    const data = (res.data as any)?.data;
    setMaterials(data?.materials || []);
    setCategories(data?.categories || []);
  }, []);

  const remove = async (id: string) => {
    await Network.request({
      url: `/api/admin/materials/${id}`,
      method: 'DELETE',
      header: authHeader(),
    });
    load();
  };

  const save = async () => {
    if (!editing.id) return;
    const payload = {
      ...editing,
      tags: editing.tags || [],
      width: Number(editing.width) || 1024,
      height: Number(editing.height) || 1024,
    };
    if (!editing.url) return;
    await Network.request({
      url: editorUrl(payload.id!),
      method: editorUrl(payload.id!) === '/api/admin/materials' ? 'POST' : 'PUT',
      header: authHeader(),
      data: payload,
    });
    setEditing({ tags: [] });
    setAutoId('');
    load();
  };

  const editorUrl = (id: string) =>
    id && materials.some((m) => m.id === id) ? `/api/admin/materials/${id}` : '/api/admin/materials';

  /** H5 端绕过 Taro.uploadFile：Coze 沙箱 Service Worker 会拦截 blob fetch 导致上传失败，
 *  改为创建原生 file input 取原始 File 对象，用 XHR + FormData 上传。 */
  const uploadH5File = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const g: any = globalThis;
      const input: any = g.document?.createElement?.('input');
      if (!input) return reject(new Error('当前环境不支持上传'));
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file: any = input.files?.[0];
        if (!file) return reject(new Error('未选择文件'));
        try {
          const form = new g.FormData();
          form.append('file', file);
          const xhr = new g.XMLHttpRequest();
          xhr.open('POST', '/api/admin/upload');
          xhr.setRequestHeader('Authorization', authHeader().Authorization);
          xhr.onload = () => {
            try {
              const body = JSON.parse(xhr.responseText);
              const data = body?.data;
              if (data?.url) return resolve(data.url);
              reject(new Error('上传未返回图片地址'));
            } catch (e) {
              reject(e);
            }
          };
          xhr.onerror = () => reject(new Error('网络错误'));
          xhr.send(form);
        } catch (e) {
          reject(e);
        }
      };
      input.click();
    });

  const applyUrl = (field: 'url' | 'thumbUrl', url: string) => {
    setEditing((prev) => {
      // 上传原图时同步生成预览缩略图（同一物理文件）
      const next = { ...prev, url: field === 'url' ? url : prev.url };
      if (field === 'url') {
        next.thumbUrl = next.thumbUrl || url;
        const fn = url.split('/').pop() || '';
        setAutoId(fn.replace(/\.\w+$/, ''));
      } else {
        next.thumbUrl = url;
      }
      return next;
    });
  };

  const uploadImage = async (field: 'url' | 'thumbUrl') => {
    try {
      const isMiniApp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP || Taro.getEnv() === Taro.ENV_TYPE.TT;
      let url: string;
      if (isMiniApp) {
        // 小程序端：Taro.chooseImage + Network.uploadFile
        const r = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] });
        const f: any = r.tempFiles[0];
        if (!f) throw new Error('未选择文件');
        const res: any = await Network.uploadFile({
          url: '/api/admin/upload',
          filePath: f.path,
          name: 'file',
          header: authHeader(),
        });
        console.log('[admin] upload status=', res?.statusCode, 'data=', res?.data);
        // 兼容：部分平台 res.data 已是对象，部分为需 JSON.parse 的字符串
        const body = typeof res?.data === 'string' ? JSON.parse(res.data) : res.data;
        url = body?.data?.url;
      } else {
        // H5 端：绕过 Taro.uploadFile，用原始 File + XHR
        url = await uploadH5File();
      }
      if (!url) throw new Error('上传未返回图片地址');
      applyUrl(field, url);
    } catch (err: any) {
      console.error('[admin] 上传失败', err);
      Taro.showToast({ title: err?.message || '上传失败', icon: 'none' });
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View className="p-4">
      <Card>
        <CardContent className="p-4">
          <Text className="block text-sm font-semibold mb-3">新增 / 编辑素材</Text>
          <Text className="block text-xs text-slate-400 mb-3">
            {categories.length ? `可用分类：${categories.map((c) => c.key).join('、')}` : '正是用分类加载中…'}
          </Text>
          <View className="space-y-3">
            <View className="flex gap-2">
              <View className="flex-1">
                <Input placeholder="素材 id（如 girl-03）" value={editing.id || autoId}
                  onInput={(e) => setEditing({ ...editing, id: e.detail.value })}
                />
              </View>
              <View className="flex-1">
                <Input placeholder="标题（用于搜索与分享）" value={editing.title || ''}
                  onInput={(e) => setEditing({ ...editing, title: e.detail.value })}
                />
              </View>
            </View>
            <Input placeholder="分类 key（如 girl / landscape）" value={editing.category || ''}
              onInput={(e) => setEditing({ ...editing, category: e.detail.value })}
            />
            <View className="flex gap-2">
              <View className="flex-1">
                <Input placeholder="原图 URL（或点右侧上传）" value={editing.url || ''}
                  onInput={(e) => setEditing({ ...editing, url: e.detail.value })}
                />
              </View>
              <Button size="sm" variant="outline" onClick={() => uploadImage('url')}>
                <Upload size={14} className="mr-1" color="#4c9df5" /><Text>上传</Text>
              </Button>
            </View>
            <View className="flex gap-2">
              <View className="flex-1">
                <Input placeholder="缩略图 URL" value={editing.thumbUrl || ''}
                  onInput={(e) => setEditing({ ...editing, thumbUrl: e.detail.value })}
                />
              </View>
              <Button size="sm" variant="ghost" onClick={() => uploadImage('thumbUrl')}>
                <Text>传缩略图</Text>
              </Button>
            </View>
            <View className="flex gap-2">
              <View className="flex-1">
                <Input placeholder="宽（默认 1024）" type="number" value={String(editing.width || '')}
                  onInput={(e) => setEditing({ ...editing, width: Number(e.detail.value) })}
                />
              </View>
              <View className="flex-1">
                <Input placeholder="高（默认 1024）" type="number" value={String(editing.height || '')}
                  onInput={(e) => setEditing({ ...editing, height: Number(e.detail.value) })}
                />
              </View>
            </View>
            <View className="flex gap-2">
              <View className="flex-1">
                <Input placeholder="标签（逗号分隔，如 治愈,头像）" value={tagInput}
                  onInput={(e) => { setTagInput(e.detail.value); setEditing({ ...editing, tags: e.detail.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean) }); }}
                />
              </View>
              <Button size="sm" disabled={!editing.url} onClick={save}>
                <Text>{materials.some((m) => m.id === editing.id) ? '保存修改' : '新增素材'}</Text>
              </Button>
            </View>
          </View>
        </CardContent>
      </Card>

      <Text className="block text-sm text-slate-500 mt-5 mb-2">素材列表（{materials.length}）</Text>
      <View className="space-y-2">
        {materials.map((m) => (
          <Card key={m.id}>
            <CardContent className="p-3 flex items-center gap-3">
              {m.thumbUrl ? (
                <Image className="w-14 h-14 rounded-lg bg-slate-100" src={m.thumbUrl} mode="aspectFill" />
              ) : (
                <View className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Images size={20} color="#9ca3af" />
                </View>
              )}
              <View className="flex-1 min-w-0">
                <Text className="block text-sm font-medium truncate">{m.title}</Text>
                <Text className="block text-xs text-slate-400 truncate">{m.id} · {m.category}</Text>
                <View className="flex flex-wrap gap-1 mt-1">
                  {(m.tags || []).slice(0, 3).map((t) => <Badge key={t} variant="secondary"><Text>{t}</Text></Badge>)}
                </View>
              </View>
              <Button size="sm" variant="outline" onClick={() => { setEditing({ ...m }); setAutoId(''); setTagInput((m.tags || []).join(',')); }}>
                <Text>编辑</Text>
              </Button>
              <Button size="sm" variant="destructive" onClick={() => remove(m.id)}>
                <Text>删</Text>
              </Button>
            </CardContent>
          </Card>
        ))}
      </View>
    </View>
  );
}

/* ----------------------------- 配置管理 ----------------------------- */
function ConfigTab() {
  const [cfg, setCfg] = useState<Partial<PubConfig>>({});
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await Network.request({ url: '/api/admin/config', header: authHeader() });
    const data = (res.data as any)?.data;
    setCfg(data || {});
  }, []);
  const save = async () => {
    await Network.request({ url: '/api/admin/config', method: 'PUT', header: authHeader(), data: cfg });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    Taro.showToast({ title: '已保存', icon: 'success' });
  };
  const set = (k: keyof PubConfig) => (e: any) => setCfg({ ...cfg, [k]: e.detail.value });

  useEffect(() => { load(); }, [load]);

  const fields: { key: keyof PubConfig; label: string; hint: string; password?: boolean }[] = [
    { key: 'appName', label: '小程序名称', hint: '用于分享文案与搜一搜关键词' },
    { key: 'contactEmail', label: '侵权投诉邮箱', hint: '关于页展示的投诉入口' },
    { key: 'adminPassword', label: '管理口令', hint: '管理后台登录口令（请修改）', password: true },
    { key: 'bannerAdId', label: 'Banner 广告位 ID', hint: '流量主 banner；留空则不展示' },
    { key: 'rewardAdId', label: '激励视频广告位 ID', hint: '解锁下载激励视频；留空则解锁降级为直接下载' },
    { key: 'aiModel', label: ' 生图模型', hint: '如 doubao-seedream-4-5-251128' },
    { key: 'aiModelEndpoint', label: ' 生图模型地址', hint: 'modelBaseUrl；留空用平台默认（扣子/豆包）' },
    { key: 'aiSize', label: '生图尺寸', hint: 'SDK 仅支持 2K / 4K' },
  ];
  const ossFields: { key: keyof PubConfig; label: string; hint: string; password?: boolean }[] = [
    { key: 'ossEndpoint', label: 'OSS Endpoint（区域接入点）', hint: '不含桶名！华北 https://oss-cn-beijing.aliyuncs.com；华东 https://oss-cn-shanghai.aliyuncs.com' },
    { key: 'ossBucket', label: 'OSS 存储空间 (Bucket)', hint: '阿里云 Bucket 名称，如 img389（勿写进 Endpoint）' },
    { key: 'ossRegion', label: 'OSS 区域', hint: '须与 Endpoint 一致：cn-beijing 华北 / cn-shanghai 华东 / cn-hangzhou 华东' },
    { key: 'ossAccessKey', label: 'AccessKey ID', hint: '阿里云 RAM 密钥 AK（形如 LT…，仅管理端可见）', password: true },
    { key: 'ossSecretKey', label: 'AccessKey Secret', hint: '阿里云 RAM 密钥 SK（务必完整复制；仅管理端可见）', password: true },
    { key: 'ossPublicUrl', label: 'Bucket 公网访问域名', hint: '对象存储控制台该 Bucket 的外网访问域名，如 img389.oss-cn-beijing.aliyuncs.com，可不带 https://；配好即可永久访问图片' },
  ];

  return (
    <View className="p-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          {fields.map((f) => (
            <View key={f.key}>
              <Text className="block text-sm font-medium mb-1">{f.label}</Text>
              <View className="bg-slate-50 rounded-lg px-3 py-2">
                <Input
                  className="w-full bg-transparent"
                  password={f.password}
                  value={String(cfg[f.key] ?? '')}
                  onInput={f.password ? (e) => setCfg({ ...cfg, adminPassword: e.detail.value }) : set(f.key)}
                  placeholder={f.hint}
                />
              </View>
              <Text className="block text-xs text-slate-400 mt-1">{f.hint}</Text>
            </View>
          ))}
          <View className="pt-3 border-t border-slate-100">
            <Text className="block text-sm font-semibold mb-3">对象存储（阿里云 OSS，可选）</Text>
            {ossFields.map((f) => (
              <View key={f.key} className="mb-3">
                <Text className="block text-sm font-medium mb-1">{f.label}</Text>
                <View className="bg-slate-50 rounded-lg px-3 py-2">
                  <Input
                    className="w-full bg-transparent"
                    password={f.password}
                    value={String(cfg[f.key] ?? '')}
                    onInput={set(f.key)}
                    placeholder={f.hint}
                  />
                </View>
                <Text className="block text-xs text-slate-400 mt-1">{f.hint}</Text>
              </View>
            ))}
          </View>
          <View>
            <Text className="block text-sm font-medium mb-1">生图 Prompt 附加约束（可选）</Text>
            <View className="bg-slate-50 rounded-lg px-3 py-2">
              <Textarea
                style={{ width: '100%', minHeight: '80px', backgroundColor: 'transparent' }}
                value={cfg.aiSystemPrompt || ''}
                onInput={(e) => setCfg({ ...cfg, aiSystemPrompt: e.detail.value })}
                placeholder="如：全部以治愈系柔和色调呈现"
              />
            </View>
          </View>
          <Button className="w-full" onClick={save}>
            <Text>{saved ? '已保存 ✓' : '保存配置'}</Text>
          </Button>
        </CardContent>
      </Card>
    </View>
  );
}