import { useState, useEffect } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { User, Heart, Download, KeyRound, LogIn, LogOut, Mail, ChevronDown, MessageCircleCode } from 'lucide-react-taro';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { assetUrl } from '@/utils/asset';
import { fetchPublicConfig } from '@/services/config';
import {
  fetchMe,
  userLogin,
  logoutLocal,
  isLogged,
  fetchByCode,
  UserData,
  MaterialItem,
} from '@/services/user';
import './index.css';

/** 侵权投诉 / 反馈邮箱（后端云端配置未返回时的兜底邮箱） */
const FALLBACK_EMAIL = 'support@example.com';

const FAQS = [
  { q: '如何下载高清原图？', a: '打开任意素材详情页，点击“保存无水印原图”，观看一条激励视频即可保存到相册。基础浏览始终免费。' },
  { q: '点赞与下载记录存在哪里？', a: '记录与当前设备关联（无需注册）。更换设备或清除小程序缓存后，历史记录不会保留。' },
  { q: '什么是“口令取图”？', a: '每张素材都有 8 位口令取图码。在“口令取图”输入他人分享的口令码，即可直接打开对应素材。' },
  { q: '素材可以商用吗？', a: '本站素材由 AI 生成或来自 CC0 素材库，仅供个人浏览下载。商用前请自行确认版权合规。' },
  { q: '遇到侵权或问题如何反馈？', a: '请通过页面底部“侵权投诉 / 意见反馈邮箱”复制邮箱与我们联系，我们会在核实后尽快处理。' },
];

const Empty = ({ text }: { text: string }) => (
  <View className="flex flex-col items-center justify-center py-10">
    <Text className="block text-sm text-gray-400">{text}</Text>
  </View>
);

const MinePage = () => {
  const [email, setEmail] = useState(FALLBACK_EMAIL);
  const [user, setUser] = useState<UserData | null>(null);
  const [logged, setLogged] = useState<boolean>(isLogged());
  const [codeInput, setCodeInput] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    fetchPublicConfig()
      .then((cfg) => {
        if (cfg?.contactEmail) setEmail(cfg.contactEmail);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (logged) load();
    else setUser(null);
  }, [logged]);

  const load = async () => {
    try {
      setUser(await fetchMe());
    } catch {
      /* 忽略 */
    }
  };

  const onLogin = async () => {
    try {
      setUser(await userLogin());
      setLogged(true);
      toast.success('登录成功');
    } catch {
      toast.error('登录失败，请重试');
    }
  };

  const onLogout = () => {
    logoutLocal();
    setLogged(false);
    setUser(null);
    toast.success('已退出登录');
  };

  const onFetchByCode = async () => {
    const code = codeInput.trim();
    if (!code) {
      toast.error('请输入 8 位口令取图码');
      return;
    }
    try {
      const { material } = await fetchByCode(code);
      Taro.navigateTo({ url: `/pages/detail/index?id=${material.id}` });
      setCodeInput('');
    } catch {
      toast.error('口令取图码无效');
    }
  };

  const goDetail = (item: MaterialItem) => Taro.navigateTo({ url: `/pages/detail/index?id=${item.id}` });

  const onMail = () => {
    Taro.setClipboardData({
      data: email,
      success: () => toast.success('邮箱已复制'),
    });
  };

  const renderGrid = (items: MaterialItem[]) => {
    const left = items.filter((_, i) => i % 2 === 0);
    const right = items.filter((_, i) => i % 2 === 1);
    const col = (arr: MaterialItem[]) => (
      <View className="flex-1">
        {arr.map((it) => (
          <Image
            key={it.id}
            className="mb-2 w-full rounded-xl bg-slate-100"
            mode="widthFix"
            src={assetUrl(it.thumbUrl)}
            lazyLoad
            onClick={() => goDetail(it)}
          />
        ))}
      </View>
    );
    return (
      <View className="flex flex-row gap-2">
        {col(left)}
        {col(right)}
      </View>
    );
  };

  return (
    <View className="min-h-screen bg-white px-4 py-6">
      {/* 登录卡片 */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardContent className="flex flex-row items-center gap-3 p-4">
          <View className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <User size={28} color="#4c9df5" />
          </View>
          <View className="flex-1">
            <Text className="block text-base font-semibold text-gray-800">
              {logged ? user?.user.nickname || '微笑用户' : '未登录'}
            </Text>
            <Text className="block text-xs text-gray-400">
              {logged
                ? `ID：${user?.user.userId?.slice(0, 12) || ''}`
                : '登录后可同步你的喜欢与下载记录'}
            </Text>
          </View>
          {logged ? (
            <Button size="sm" variant="ghost" className="shrink-0 rounded-full" onClick={onLogout}>
              <LogOut size={15} color="#94a3b8" />
              <Text className="block text-slate-400">退出</Text>
            </Button>
          ) : (
            <Button size="sm" className="shrink-0 rounded-full" onClick={onLogin}>
              <LogIn size={15} color="#ffffff" />
              <Text className="block text-white">登录</Text>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* 口令取图 */}
      <Card className="mt-3 rounded-2xl border-0 shadow-sm">
        <CardContent className="p-4">
          <View className="flex flex-row items-center gap-2">
            <KeyRound size={18} color="#4c9df5" />
            <Text className="block text-sm font-semibold text-gray-800">口令取图</Text>
            <Text className="block flex-1 text-right text-xs text-gray-400">输入分享的 8 位口令码</Text>
          </View>
          <View className="mt-3 flex flex-row items-center gap-2">
            <View className="flex-1 rounded-lg bg-slate-50 px-3 py-2">
              <Input
                className="w-full bg-transparent"
                placeholder="例如 9dwzn28c"
                value={codeInput}
                onInput={(e) => setCodeInput(e.detail.value)}
              />
            </View>
            <Button size="sm" className="shrink-0 rounded-full" onClick={onFetchByCode}>
              <Text className="block text-white">取图</Text>
            </Button>
          </View>
        </CardContent>
      </Card>

      {/* 喜欢 / 下载 */}
      <Card className="mt-3 rounded-2xl border-0 shadow-sm">
        <CardContent className="p-4">
          <Tabs defaultValue="likes">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="likes">
                <Heart size={14} color="#f43f5e" /> 喜欢 · {user?.likes?.length || 0}
              </TabsTrigger>
              <TabsTrigger value="downloads">
                <Download size={14} color="#4c9df5" /> 下载 · {user?.downloads?.length || 0}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="likes" className="mt-3">
              {user && user.likes?.length ? renderGrid(user.likes) : <Empty text="还没有喜欢过素材，去逛逛吧" />}
            </TabsContent>
            <TabsContent value="downloads" className="mt-3">
              {user && user.downloads?.length ? renderGrid(user.downloads) : <Empty text="还没有下载记录" />}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 常见问题 */}
      <Card className="mt-3 rounded-2xl border-0 shadow-sm">
        <CardContent className="p-4">
          <View className="mb-2 flex flex-row items-center gap-2">
            <MessageCircleCode size={18} color="#4c9df5" />
            <Text className="block text-sm font-semibold text-gray-800">常见问题</Text>
          </View>
          {FAQS.map((f, i) => (
            <View key={i} className="border-b border-slate-100 py-2 last:border-0">
              <View
                className="flex flex-row items-center justify-between"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <Text className="block flex-1 pr-2 text-sm text-gray-700">{f.q}</Text>
                <ChevronDown size={16} color="#94a3b8" className={openFaq === i ? 'rotate-180' : ''} />
              </View>
              {openFaq === i ? (
                <Text className="block mt-1 text-xs leading-relaxed text-gray-500">{f.a}</Text>
              ) : null}
            </View>
          ))}
        </CardContent>
      </Card>

      {/* 侵权投诉 / 反馈 */}
      <Card className="mt-3 rounded-2xl border-0 shadow-sm">
        <CardContent className="p-4">
          <View className="flex flex-row items-center gap-2">
            <Mail size={18} color="#4c9df5" />
            <Text className="block flex-1 text-sm text-gray-600">侵权投诉 / 意见反馈邮箱</Text>
            <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={onMail}>
              <Text className="block text-xs text-blue-500">复制</Text>
            </Button>
          </View>
          <Text className="block mt-2 text-xs text-gray-400">{email}</Text>
        </CardContent>
      </Card>

      {/* 管理后台入口（需管理口令登录） */}
      <View className="mt-6 flex justify-center">
        <Button
          size="sm"
          variant="ghost"
          className="text-gray-400"
          onClick={() => Taro.navigateTo({ url: '/pages/admin/index' })}
        >
          <Text className="block text-xs text-gray-400">管理后台</Text>
        </Button>
      </View>

      <Text className="block mt-8 text-center text-xs text-gray-400">
        AI头像壁纸大全 · 让每一张图都治愈你
      </Text>
    </View>
  );
};

export default MinePage;