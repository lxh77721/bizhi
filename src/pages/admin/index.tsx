import { useState, useCallback, useEffect } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  FolderTree,
  Images,
  Settings as SettingsIcon,
  LogOut,
  Download,
  Trash2,
  LayoutGrid,
} from 'lucide-react-taro';
import {
  TOKEN_KEY,
  authHeader,
  AdminStats,
} from './shared';

export default function Admin() {
  // 进入管理后台总是先显示登录界面，输入口令成功后才进入看板
  const [authed, setAuthed] = useState(false);
  const [pwd, setPwd] = useState('');
  const [loginErr, setLoginErr] = useState('');
  // Taro 会把页面实例保留在页面栈里：从「抓取素材」返回本页时不会重新挂载，
  // 只挂载时拉一次数据的话，「图片总数」会一直停在进入本页时的旧值 —— 看起来就像
  // 「提示已新增 N 张，但图片数量还是 0」。用每次显示时的序号驱动刷新。
  const [showSeq, setShowSeq] = useState(0);
  useDidShow(() => setShowSeq((n) => n + 1));

  const doLogin = useCallback(async () => {
    try {
      const res = await Network.request({
        url: '/api/admin/login',
        method: 'POST',
        data: { password: pwd },
      });
      const data = (res.data as any)?.data;
      Taro.setStorageSync(TOKEN_KEY, data.token);
      setAuthed(true);
      setLoginErr('');
    } catch (err: any) {
      setLoginErr((err?.data && (err.data as any)?.message) || '登录失败，请检查口令');
    }
  }, [pwd]);

  const logout = useCallback(async () => {
    try {
      await Network.request({
        url: '/api/admin/logout',
        method: 'POST',
        header: authHeader(),
      });
    } catch {
      /* ignore */
    }
    Taro.removeStorageSync(TOKEN_KEY);
    setAuthed(false);
    setPwd('');
  }, []);

  if (!authed) {
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

  return <Dashboard onLogout={logout} showSeq={showSeq} />;
}

/* --------------------------- 登录后的看板 --------------------------- */
function Dashboard({ onLogout, showSeq }: { onLogout: () => void; showSeq: number }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [flushing, setFlushing] = useState(false);

  const load = useCallback(async () => {
    const res = await Network.request({ url: '/api/admin/stats', header: authHeader() });
    setStats((res.data as any)?.data as AdminStats);
  }, []);

  useEffect(() => {
    load();
  }, [load, showSeq]);

  /** 立即把待写入的数据落库（数据库抖动/降级时手动补写） */
  const flushStorage = useCallback(async () => {
    setFlushing(true);
    try {
      const res = await Network.request({
        url: '/api/admin/storage/flush',
        method: 'POST',
        header: authHeader(),
      });
      const d = (res.data as any)?.data;
      const left = d?.pendingAfter?.length ?? 0;
      Taro.showToast({
        title: d?.flushed ? '已全部写入数据库' : `仍有 ${left} 项未写入`,
        icon: d?.flushed ? 'success' : 'none',
      });
      load();
    } catch {
      Taro.showToast({ title: '操作失败，请稍后重试', icon: 'none' });
    } finally {
      setFlushing(false);
    }
  }, [load]);

  const entries = [
    {
      title: '分类管理',
      desc: '新增 / 删除分类',
      icon: <FolderTree size={24} color="#4c9df5" />,
      bg: 'bg-blue-50',
      url: '/pages/admin-categories/index',
    },
    {
      title: '图片管理',
      desc: '上传图片 / 查看删除',
      icon: <Images size={24} color="#10b981" />,
      bg: 'bg-emerald-50',
      url: '/pages/admin-pictures/index',
    },
    {
      title: '抓取素材',
      desc: '从站点自动抓取',
      icon: <Download size={24} color="#8b5cf6" />,
      bg: 'bg-violet-50',
      url: '/pages/admin-crawl/index',
    },
    {
      title: '系统配置',
      desc: '广告 / 对象存储',
      icon: <SettingsIcon size={24} color="#f59e0b" />,
      bg: 'bg-amber-50',
      url: '/pages/admin-config/index',
    },
  ];

  const confirmPurge = () => {
    Taro.showModal({
      title: '清空全部数据',
      content: '将删除所有分类与图片（不可恢复），确定继续？',
      confirmColor: '#ef4444',
      success: async (r) => {
        if (!r.confirm) return;
        await Network.request({
          url: '/api/admin/purge',
          method: 'POST',
          header: authHeader(),
        });
        Taro.showToast({ title: '已清空', icon: 'success' });
        load();
      },
    });
  };

  const go = (url: string) => Taro.navigateTo({ url });

  const cards = [
    { label: '图片总数', value: stats?.materialCount ?? '-', color: 'text-blue-500' },
    { label: '分类总数', value: stats?.categoryCount ?? '-', color: 'text-emerald-500' },
    { label: '解锁次数', value: stats?.unlockCount ?? '-', color: 'text-amber-500' },
  ];

  return (
    <View className="min-h-screen bg-slate-50">
      {/* 顶部栏 */}
      <View className="bg-white px-4 pt-6 pb-4 flex items-center justify-between border-b border-slate-100">
        <View className="flex items-center">
          <View className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mr-3">
            <LayoutGrid size={20} color="#4c9df5" />
          </View>
          <View>
            <Text className="block text-base font-semibold">管理看板</Text>
            <Text className="block text-xs text-slate-400">简影壁纸馆后台</Text>
          </View>
        </View>
        <Button size="sm" variant="ghost" onClick={onLogout}>
          <LogOut size={16} className="mr-1" color="#64748b" />
          <Text>退出</Text>
        </Button>
      </View>

      <View className="p-4">
        {/* 数据概览 */}
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

        {/* 持久化状态：数据库没生效时数据会随实例回收丢失，必须显眼提示 */}
        {stats?.storage ? (
          <Card
            className={`mt-3 ${
              stats.storage.database ? 'border-emerald-200' : 'border-red-300 bg-red-50'
            }`}
          >
            <CardContent className="p-4">
              <View className="flex items-center justify-between">
                <View className="flex items-center flex-1 mr-2">
                  <View
                    className={`w-2.5 h-2.5 rounded-full mr-2 ${
                      stats.storage.database ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                  />
                  <Text className="text-sm font-semibold">
                    {stats.storage.database ? '数据已存入数据库' : '数据库未生效，数据会丢'}
                  </Text>
                </View>
                <Button size="sm" variant="outline" onClick={flushStorage} disabled={flushing}>
                  <Text>{flushing ? '写入中…' : '立即落库'}</Text>
                </Button>
              </View>
              <Text className="block text-xs text-slate-500 mt-2">
                {stats.storage.database
                  ? `待落库 ${stats.storage.pendingWrites} 项 · 累计写入成功 ${stats.storage.dbWritesOk} 次`
                  : '当前数据只写在服务器本地，实例回收或重新部署后会回到初始状态，请检查数据库环境变量'}
              </Text>
              {stats.storage.lastError ? (
                <Text className="block text-xs text-red-500 mt-1">
                  最近错误：{stats.storage.lastError}
                </Text>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* 功能入口 */}
        <Text className="block text-sm text-slate-500 mt-5 mb-3">功能管理</Text>
        <View className="grid grid-cols-2 gap-3">
          {entries.map((e) => (
            <Card key={e.title} className="active:scale-95 transition-transform">
              <CardContent className="p-4" onClick={() => go(e.url)}>
                <View className={`w-11 h-11 rounded-xl ${e.bg} flex items-center justify-center mb-3`}>
                  {e.icon}
                </View>
                <Text className="block text-sm font-semibold">{e.title}</Text>
                <Text className="block text-xs text-slate-400 mt-1">{e.desc}</Text>
              </CardContent>
            </Card>
          ))}
        </View>

        {/* 危险操作 */}
        <Button
          variant="outline"
          className="w-full mt-5 border-red-200 text-red-500"
          onClick={confirmPurge}
        >
          <Trash2 size={16} className="mr-1" color="#ef4444" />
          <Text>清空全部数据</Text>
        </Button>
      </View>
    </View>
  );
}
