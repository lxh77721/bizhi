import { useState, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import {
  Heart, Download, KeyRound, MessageCircle, Mail, User, LogIn, LogOut, ChevronRight,
} from 'lucide-react-taro';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { fetchPublicConfig } from '@/services/config';
import { fetchMe, userLogin, logoutLocal, isLogged, fetchByCode } from '@/services/user';

const FALLBACK_EMAIL = 'support@example.com';

export default function Mine() {
  const [email, setEmail] = useState(FALLBACK_EMAIL);
  const [logged, setLogged] = useState(isLogged());
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [mailOpen, setMailOpen] = useState(false);

  useEffect(() => {
    fetchPublicConfig().then((c: any) => { if (c?.contactEmail) setEmail(c.contactEmail); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (logged) syncUser();
  }, [logged]);

  const syncUser = async () => {
    try {
      const u = await fetchMe();
      setUserName(u.user.nickname || '微笑用户');
      setUserId(u.user.userId);
    } catch { /* ignore */ }
  };

  const onLogin = async () => {
    try {
      const u = await userLogin();
      setUserName(u.user.nickname || '微笑用户');
      setUserId(u.user.userId);
      setLogged(true);
    } catch {
      toast.error('登录失败，请重试');
    }
  };

  const onLogout = () => {
    logoutLocal();
    setLogged(false);
    toast.success('已退出登录');
  };

  const go = (url: string) => Taro.navigateTo({ url });

  const onFetchByCode = async () => {
    const c = code.trim();
    if (!c) {
      toast.error('请输入 8 位口令取图码');
      return;
    }
    try {
      const { material } = await fetchByCode(c);
      setCodeOpen(false);
      setCode('');
      Taro.navigateTo({ url: `/pages/detail/index?id=${material.id}` });
    } catch {
      toast.error('口令取图码无效');
    }
  };

  const onCopyMail = () => Taro.setClipboardData({ data: email, success: () => toast.success('邮箱已复制') });

  const row = (icon: React.ReactNode, label: string, onClick: () => void, right?: string) => (
    <View className="flex flex-row items-center justify-between py-3" onClick={onClick}>
      <View className="flex flex-row items-center gap-3">
        {icon}
        <Text className="block text-sm text-gray-700">{label}</Text>
      </View>
      <View className="flex flex-row items-center gap-1">
        {right ? <Text className="block text-xs text-gray-400">{right}</Text> : null}
        <ChevronRight size={16} color="#cbd5e1" />
      </View>
    </View>
  );

  return (
    <View className="min-h-screen bg-white px-4 py-6">
      {/* 用户卡片 */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <View className="p-4 flex flex-row items-center gap-3">
          <View className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <User size={28} color="#4c9df5" />
          </View>
          <View className="flex-1">
            <Text className="block text-base font-semibold text-gray-800">{logged ? userName : '未登录'}</Text>
            <Text className="block text-xs text-gray-400">
              {logged ? `ID：${userId.slice(0, 12)}` : '登录后可同步喜欢与下载记录'}
            </Text>
          </View>
          {logged ? (
            <Button size="sm" variant="ghost" className="shrink-0 rounded-full" onClick={onLogout}>
              <LogOut size={15} color="#94a3b8" />
              <Text className="block text-slate-400">退出</Text>
            </Button>
          ) : (
            <Button size="sm" className="shrink-0 rounded-full" onClick={onLogin}>
              <LogIn size={15} color="#fff" />
              <Text className="block text-white">登录</Text>
            </Button>
          )}
        </View>
      </Card>

      {/* 功能菜单 */}
      <Card className="mt-3 rounded-2xl border-0 shadow-sm">
        <View className="px-4 py-1">
          {row(<Heart size={18} color="#f43f5e" />, '我的喜欢', () => go('/pages/my-likes/index'))}
          <View className="h-px bg-slate-50" />
          {row(<Download size={18} color="#4c9df5" />, '我的下载', () => go('/pages/my-downloads/index'))}
          <View className="h-px bg-slate-50" />
          {row(<KeyRound size={18} color="#f59e0b" />, '口令取图', () => setCodeOpen(true))}
          <View className="h-px bg-slate-50" />
          {row(<MessageCircle size={18} color="#10b981" />, '常见问题', () => go('/pages/faq/index'))}
          <View className="h-px bg-slate-50" />
          {row(<Mail size={18} color="#8b5cf6" />, '侵权投诉 / 反馈', () => setMailOpen(true))}
        </View>
      </Card>

      <Text className="block mt-10 text-center text-xs text-gray-300 underline" onClick={() => go('/pages/admin/index')}>
        管理后台
      </Text>
      <Text className="block mt-2 text-center text-xs text-gray-400">AI头像壁纸大全 · 让每一张图都治愈你</Text>

      {/* 口令取图弹窗 */}
      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>口令取图</DialogTitle>
          </DialogHeader>
          <View className="mt-2">
            <View className="rounded-lg bg-slate-50 px-3 py-2">
              <Input className="w-full bg-transparent" placeholder="输入 8 位口令码" value={code} onInput={(e) => setCode(e.detail.value)} />
            </View>
            <Text className="block mt-1 text-xs text-gray-400">向好友索要素材的 8 位口令码即可获取</Text>
          </View>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCodeOpen(false)}>
              <Text className="block text-slate-500">取消</Text>
            </Button>
            <Button size="sm" onClick={onFetchByCode}>
              <Text className="block text-white">取图</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 邮箱弹窗 */}
      <Dialog open={mailOpen} onOpenChange={setMailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>侵权投诉 / 意见反馈</DialogTitle>
          </DialogHeader>
          <View className="mt-2 p-3 rounded-lg bg-slate-50">
            <Text className="block text-sm text-gray-700">{email}</Text>
          </View>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setMailOpen(false)}>
              <Text className="block text-slate-500">关闭</Text>
            </Button>
            <Button size="sm" onClick={onCopyMail}>
              <Text className="block text-white">复制邮箱</Text>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </View>
  );
}