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
import { Settings, Images, FolderTree, LayoutDashboard, LogOut, Upload } from 'lucide-react-taro';

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
  const [token, setToken] = useState(() => Taro.getStorageSync(TOKEN_KEY) || '');
  const [pwd, setPwd] = useState('');
  const [loginErr, setLoginErr] = useState('');

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
      setToken(data.token);
      setLoginErr('');
    } catch (err: any) {
      setLoginErr((err?.data && (err.data as any)?.message) || '登录失败，请检查口令');
    }
  }, [pwd]);

  if (!token) {
    return (
      <View className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="p-6">
            <Text className="block text-lg font-semibold text-center mb-1">AI头像壁纸 · 管理后台</Text>
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

  return <AdminPanel onLogout={() => setToken('')} />;
}

function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState('stats');
  const logout = () => {
    Network.request({ url: '/api/admin/logout', method: 'POST', header: authHeader() });
    Taro.removeStorageSync(TOKEN_KEY);
    onLogout();
  };

  return (
    <View className="min-h-screen bg-slate-100">
      {/* 顶栏 */}
      <View className="bg-white px-4 py-3 flex items-center justify-between border-b border-slate-200">
        <Text className="text-base font-semibold">管理后台</Text>
        <Button size="sm" variant="ghost" onClick={logout}>
          <LogOut size={16} className="mr-1" color="#4c9df5" />
          <Text>退出</Text>
        </Button>
      </View>

      <Tabs value={tab} onValueChange={setTab}>
        <View className="bg-white px-2 py-2 flex border-b border-slate-100 sticky top-0 z-10">
          <TabsList className="w-full grid-cols-4 gap-1">
            <TabsTrigger value="stats">
              <LayoutDashboard size={15} className="mr-1" color="#4c9df5" />
              <Text>看板</Text>
            </TabsTrigger>
            <TabsTrigger value="materials">
              <Images size={15} className="mr-1" color="#4c9df5" />
              <Text>素材</Text>
            </TabsTrigger>
            <TabsTrigger value="categories">
              <FolderTree size={15} className="mr-1" color="#4c9df5" />
              <Text>分类</Text>
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
          <TabsContent value="categories">
            <CategoriesTab />
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
    { label: 'AI 生成次数', value: stats?.generateCount ?? '-', color: 'text-violet-500' },
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
            素材与分类的管理请切换到「素材」「分类」标签；流量主广告位 ID、AI 模型等在「配置」标签维护。
            统计次数包含 AI 生成与激励视频解锁下载两个维度。
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

  const uploadImage = async (field: 'url' | 'thumbUrl') => {
    try {
      const r = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] });
      const f = r.tempFiles[0];
      const res: any = await Network.uploadFile({
        url: '/api/admin/upload',
        filePath: (f as any).path,
        name: 'file',
        header: authHeader(),
      });
      const data = JSON.parse(res.data).data;
      setEditing((prev) => {
        // 上传原图时同步生成预览缩略图（同一物理文件）
        const next = { ...prev, url: field === 'url' ? data.url : prev.url };
        if (field === 'url') {
          next.thumbUrl = next.thumbUrl || data.url;
          const base = data.url.replace(/\.\w+$/, '');
          void base;
          setAutoId(data.url.split('/').pop().replace(/\.\w+$/, ''));
        } else {
          next.thumbUrl = data.url;
        }
        return next;
      });
    } catch (err) {
      Taro.showToast({ title: '上传失败', icon: 'none' });
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

/* ----------------------------- 分类管理 ----------------------------- */
function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('');

  const load = useCallback(async () => {
    const res = await Network.request({ url: '/api/admin/materials', header: authHeader() });
    setCategories((res.data as any)?.data?.categories || []);
  }, []);
  const add = async () => {
    if (!key || !label) return;
    await Network.request({ url: '/api/admin/categories', method: 'POST', header: authHeader(), data: { key, label, icon } });
    setKey(''); setLabel(''); setIcon('');
    load();
  };
  const remove = async (k: string) => {
    await Network.request({ url: `/api/admin/categories/${k}`, method: 'DELETE', header: authHeader() });
    load();
  };

  useEffect(() => { load(); }, [load]);

  return (
    <View className="p-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <Text className="block text-sm font-semibold">新增分类（key 对应素材 category 字段）</Text>
          <View className="flex gap-2">
            <Input placeholder="key（如 nature / cartoon）" value={key} onInput={(e) => setKey(e.detail.value)} />
          </View>
          <View className="flex gap-2">
            <View className="flex-1"><Input placeholder="展示名（如 治愈风景）" value={label} onInput={(e) => setLabel(e.detail.value)} /></View>
            <View className="flex-1"><Input placeholder="图标名（可选）" value={icon} onInput={(e) => setIcon(e.detail.value)} /></View>
            <Button onClick={add}><Text>新增</Text></Button>
          </View>
        </CardContent>
      </Card>
      <Text className="block text-sm text-slate-500 mt-5 mb-2">分类列表（{categories.length}）</Text>
      <View className="space-y-2">
        {categories.map((c) => (
          <Card key={c.key}>
            <CardContent className="p-3 flex items-center justify-between">
              <View className="flex items-center gap-2">
                <Badge variant="default"><Text>{c.label}</Text></Badge>
                <Text className="text-xs text-slate-400">{c.key}{c.icon ? ` · icon=${c.icon}` : ''}</Text>
              </View>
              <Button size="sm" variant="destructive" onClick={() => remove(c.key)}><Text>删</Text></Button>
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
    { key: 'aiModel', label: 'AI 生图模型', hint: '如 doubao-seedream-4-5-251128' },
    { key: 'aiModelEndpoint', label: 'AI 生图模型地址', hint: 'modelBaseUrl；留空用平台默认（扣子/豆包）' },
    { key: 'aiSize', label: '生图尺寸', hint: 'SDK 仅支持 2K / 4K' },
  ];
  const ossFields: { key: keyof PubConfig; label: string; hint: string; password?: boolean }[] = [
    { key: 'ossEndpoint', label: 'OSS 访问域名（七牛云）', hint: 'S3 兼容地址，如 https://s3-cn-east-1.qiniucs.com' },
    { key: 'ossBucket', label: 'OSS 存储空间 (Bucket)', hint: '七牛云空间名称' },
    { key: 'ossRegion', label: 'OSS 区域', hint: '默认 cn-east-1（华东）' },
    { key: 'ossAccessKey', label: 'OSS Access Key', hint: '七牛云 AK（不向下发）', password: true },
    { key: 'ossSecretKey', label: 'OSS Secret Key', hint: '七牛云 SK（不向下发）', password: true },
    { key: 'ossPublicUrl', label: 'OSS 公开读域名', hint: '如 CDN/测试域名 bkt.clouddn.com；留空则素材用 30 天预签名 URL' },
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
            <Text className="block text-sm font-semibold mb-3">对象存储（七牛云 OSS，可选）</Text>
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