import { useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { Wand, Download, CirclePlay, Sparkles, Lock } from 'lucide-react-taro';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { REWARD_AD_ID } from '@/constants/ad';
import { assetUrl } from '@/utils/asset';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import './index.css';

/** 仅微信小程序支持激励视频广告 */
const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP;

// 激励视频广告位 ID 见 @/constants/ad.ts（未开通前留空，解锁自动降级为直接下载）

/** 预设灵感（均为合规的原创插画/风景/抽象/文字氛围方向） */
const SUGGESTIONS = [
  '粉色云朵治愈插画',
  '雪山湖泊风景壁纸',
  '极简蓝灰渐变氛围壁纸',
  '星空抽象艺术头像',
  '森林晨雾治愈风景',
  '落日海滩氛围壁纸',
];

interface AiResult {
  rejected: boolean;
  reason?: string;
  prompt?: string;
  thumbUrl?: string;
  fullUrl?: string;
}

const AiPage = () => {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiResult | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  // 是否已解锁（观看激励视频或未接入广告时直接设为 true），解锁后去水印并下载原图
  const [unlocked, setUnlocked] = useState(false);

  useShareAppMessage(() => ({
    title: '用「AI头像壁纸大全」一键生成原创头像与治愈壁纸，快来试试',
    path: '/pages/ai/index',
  }));

  /** 生成图片 */
  const onGenerate = async () => {
    const kw = keyword.trim();
    if (!kw) {
      toast.info('请先输入想生成的图片描述');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await Network.request({
        url: '/api/ai/generate',
        method: 'POST',
        data: { keyword: kw },
      });
      setResult((res.data as any)?.data || null);
    } catch (err: any) {
      console.error('[ai] 生成失败', err);
      toast.error((err as any)?.message || '生成失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  /** 保存图片到相册 */
  const saveToAlbum = async (url: string) => {
    try {
      const dl = await Network.downloadFile({ url });
      try {
        await Taro.saveImageToPhotosAlbum({ filePath: dl.tempFilePath });
        toast.success('已保存到相册');
      } catch (authErr: any) {
        if (authErr?.errMsg?.includes('auth deny') || authErr?.errMsg?.includes('authorize')) {
          const confirm = await Taro.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册',
            confirmText: '去设置',
          });
          if (confirm.confirm) Taro.openSetting();
        }
      }
    } catch (err) {
      console.error('[ai] 下载失败', err);
      toast.error('下载失败，请稍后重试');
    }
  };

  /** 下载高清原图：点击后先解锁（激励视频）再保存 */
  const unlockDownload = async () => {
    const url = assetUrl(result?.fullUrl || result?.thumbUrl || '')
    setLockOpen(false);
    if (!url) return;
    if (!isWeapp || !REWARD_AD_ID) {
      await saveToAlbum(url);
      setUnlocked(true);
      return;
    }
    const ad = Taro.createRewardedVideoAd({ adUnitId: REWARD_AD_ID });
    ad.onError((err) => {
      console.error('[ai] 激励视频错误', err);
      toast.error('广告加载失败，请稍后再试');
    });
    ad.onClose(async (res) => {
      if (res && res.isEnded) {
        toast.success('已解锁，开始下载');
        setUnlocked(true);
        if (url) await saveToAlbum(url);
      } else {
        toast.info('完整观看视频后才能解锁下载哦');
      }
    });
    ad.show().catch(() => ad.show());
  };

  return (
    <View className="min-h-screen bg-white px-4 pt-6">
      {/* 标题 */}
      <Text className="block text-xl font-bold text-gray-800">AI 一键生成专属头像壁纸</Text>
      <Text className="block mt-1 text-sm text-gray-500">
        输入描述关键词，AI 为你生成原创插画 / 风景 / 抽象 / 文字氛围素材
      </Text>

      {/* 输入框 */}
      <View className="mt-4 flex flex-row items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3">
        <Sparkles size={18} color="#4c9df5" />
        <Input
          className="flex-1 bg-transparent text-sm"
          placeholder="例：粉色云朵治愈插画、雪山湖泊壁纸…"
          value={keyword}
          maxlength={100}
          onInput={(e) => setKeyword((e as any).detail?.value || '')}
          onConfirm={onGenerate}
        />
        <Button
          size="sm"
          className="shrink-0 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-4"
          onClick={onGenerate}
          disabled={loading}
        >
          <Wand size={16} color="#fff" />
          <Text className="block text-white">{loading ? '生成中…' : '生成'}</Text>
        </Button>
      </View>

      {/* 灵感建议 */}
      <View className="mt-4 flex flex-row flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant="outline"
            className="rounded-full bg-white px-3"
            onClick={() => setKeyword(s)}
          >
            <Text className="block text-xs text-gray-500">{s}</Text>
          </Button>
        ))}
      </View>

      {/* 版权合规提示 */}
      <View className="mt-4 rounded-xl bg-blue-50 px-4 py-3">
        <Text className="block text-xs text-blue-500">
          ※ 素材由 AI 原创生成，仅支持插画 / 风景 / 抽象 / 文字氛围素材；不支持明星、动漫IP
          、真人肖像等，规避版权与肖像风险。
        </Text>
      </View>

      {/* 生成结果区 */}
      <View className="mt-5 pb-4">
        {loading ? (
          <Skeleton className="h-80 w-full rounded-2xl" />
        ) : result?.rejected ? (
          <View className="flex flex-col items-center rounded-2xl bg-slate-50 py-12">
            <Lock size={36} color="#9ca3af" />
            <Text className="block mt-3 w-3/4 text-center text-sm text-gray-500">{result.reason}</Text>
          </View>
        ) : result?.thumbUrl ? (
          <View>
            <View className="overflow-hidden rounded-2xl shadow-sm">
              <View className="relative">
                <Image
                  className="w-full"
                  mode="widthFix"
                  src={assetUrl(result.thumbUrl)}
                  onClick={() => Taro.previewImage({ urls: [assetUrl(result.thumbUrl!)] })}
                />
                {/* 免费预览水印（解锁后移除） */}
                {!unlocked && (
                  <View className="absolute inset-0 z-10 flex items-center justify-center bg-white bg-opacity-60">
                    <View className="flex items-center gap-2 rounded-full bg-black bg-opacity-60 px-5 py-3">
                      <Lock size={15} color="#ffffff" />
                      <Text className="block text-sm font-medium text-white">
                        原图已加水印 · 观看视频解锁
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
            <View className="mt-3 flex flex-row items-center justify-between px-1">
              <Text className="block text-xs text-gray-400">基础预览免费 · 点击图片可放大</Text>
              <Button
                size="sm"
                className="rounded-full bg-amber-500 px-4"
                onClick={() => setLockOpen(true)}
              >
                <Download size={16} color="#fff" />
                <Text className="block text-white">解锁高清原图</Text>
              </Button>
            </View>
          </View>
        ) : (
          <View className="flex flex-col items-center rounded-2xl bg-slate-50 py-16">
            <Wand size={40} color="#d1d5db" />
            <Text className="block mt-3 text-sm text-gray-400">
              输入描述，点击“生成”即可看到你的专属头像壁纸
            </Text>
          </View>
        )}
      </View>

      {/* 高清原图解锁弹层（非强制） */}
      <Dialog open={lockOpen} onOpenChange={setLockOpen}>
        <DialogContent className="rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex flex-row items-center gap-2">
              <Lock size={18} color="#4c9df5" />
              <Text className="block text-lg font-bold">解锁高清原图下载</Text>
            </DialogTitle>
            <DialogDescription>
              <Text className="block text-sm text-gray-500">
                观看一段激励视频即可免费解锁高清原图下载，感谢支持～
              </Text>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <View className="flex w-full flex-row gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-full"
                onClick={() => setLockOpen(false)}
              >
                <Text className="block text-gray-500">取消</Text>
              </Button>
              <Button
                className="flex-1 rounded-full bg-amber-500"
                onClick={unlockDownload}
              >
                <CirclePlay size={18} color="#fff" />
                <Text className="block text-white">观看视频解锁</Text>
              </Button>
            </View>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </View>
  );
};

export default AiPage;