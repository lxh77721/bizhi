import { useState } from 'react';
import { View, Text, Image, Ad, Button as NativeBtn } from '@tarojs/components'; // eslint-disable-line no-restricted-syntax
import Taro, {
  useLoad,
  useRouter,
  useShareAppMessage,
  useShareTimeline,
} from '@tarojs/taro';
import { Download, Lock, CirclePlay, Share2, Heart } from 'lucide-react-taro';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { BANNER_AD_ID, REWARD_AD_ID } from '@/constants/ad';
import { fetchPublicConfig, getPublicConfig } from '@/services/config';
import { assetUrl } from '@/utils/asset';
import { fetchMe, toggleLike as apiToggleLike, markDownload } from '@/services/user';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import './index.css';

interface MaterialItem {
  id: string;
  code?: string;
  title: string;
  category: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  tags: string[];
}

/** 是否为微信小程序环境（激励视频广告仅微信端可用） */
const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP;

// 激励视频与 Banner 广告位 ID 见 @/constants/ad.ts（未开通前留空，Banner 自动隐藏、解锁自动降级）

const DetailPage = () => {
  const router = useRouter();
  const [item, setItem] = useState<MaterialItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [lockOpen, setLockOpen] = useState(false);
  // 是否已解锁（观看激励视频或未接入广告时直接设为 true），解锁后可去水印下载原图
  const [unlocked, setUnlocked] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  useLoad(async () => {
    fetchPublicConfig(); // 拉取云端流量主 ID 等配置（后台可动态维护）
    const id = router.params?.id;
    if (!id) return;
    try {
      const res = await Network.request({ url: `/api/materials/${id}` });
      setItem((res.data as any)?.data || null);
      // 拉取用户喜欢状态（无身份则自动创建）
      try {
        const me = await fetchMe();
        setLiked(me.likes.some((l) => l.id === id));
      } catch {
        /* 忽略登录态异常 */
      }
    } catch (err) {
      console.error('[detail] 加载失败', err);
    } finally {
      setLoading(false);
    }
  });

  // 分享到微信群：文案自动带上小程序名称，路径带素材 id 便于回流
  useShareAppMessage(() => ({
    title: `${item?.title || '超好用头像壁纸'} - 来自「AI头像壁纸大全」，头像/壁纸/治愈壁纸免费逛`,
    path: `/pages/detail/index?id=${item?.id}`,
    imageUrl: item?.thumbUrl,
  }));

  // 分享到朋友圈
  useShareTimeline(() => ({
    title: `${item?.title || 'AI头像壁纸大全'}，超多原创头像与治愈壁纸`,
  }));

  /** 保存图片到系统相册（含相册授权引导） */
  const saveToAlbum = async (url: string) => {
    try {
      const dl = await Network.downloadFile({ url });
      const filePath = dl.tempFilePath;
      try {
        await Taro.saveImageToPhotosAlbum({ filePath });
        toast.success('已保存到相册');
      } catch (authErr: any) {
        if (authErr?.errMsg?.includes('auth deny') || authErr?.errMsg?.includes('authorize')) {
          const confirm = await Taro.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册',
            confirmText: '去设置',
          });
          if (confirm.confirm) {
            Taro.openSetting();
          }
        }
      }
    } catch (err) {
      console.error('[detail] 下载失败', err);
      toast.error('下载失败，请稍后重试');
    }
  };

  /** 激励视频解锁成功（或降级）后上报一次统计 */
  const reportUnlock = () => {
    Network.request({ url: '/api/events/unlock', method: 'POST' }).catch(() => {});
  };

  /** 观看激励视频后解锁下载 */
  const unlockDownload = () => {
    setLockOpen(false);
    const rewardId = getPublicConfig()?.rewardAdId || REWARD_AD_ID;
    if (!isWeapp || !rewardId) {
      // 开发态 / 未接入广告时降级：直接解锁并保存（便于预览）
      setUnlocked(true);
      reportUnlock();
      if (item) { saveToAlbum(assetUrl(item.url)); markDownload(item.id).catch(() => {}); }
      return;
    }
    const ad = Taro.createRewardedVideoAd({ adUnitId: rewardId });
    ad.onError((err) => {
      console.error('[detail] 激励视频错误', err);
      toast.error('广告加载失败，请稍后再试');
    });
    ad.onClose((res) => {
      if (res && res.isEnded) {
        toast.success('已解锁，开始下载');
        setUnlocked(true);
        reportUnlock();
        if (item) { saveToAlbum(assetUrl(item.url)); markDownload(item.id).catch(() => {}); }
      } else {
        toast.info('完整观看视频后才能解锁下载哦');
      }
    });
    ad.show().catch(() => ad.show());
  };

  /** 底部下载按钮点击：弹出激励视频解锁提示（不强制，可取消） */
  const onDownloadClick = () => {
    setLockOpen(true);
  };

  /** 喜欢 / 取消喜欢 */
  const onLike = async () => {
    if (!item || likeBusy) return;
    setLikeBusy(true);
    try {
      const r = await apiToggleLike(item.id);
      setLiked(r.liked);
    } catch (err) {
      toast.error('操作失败，请重试');
    } finally {
      setLikeBusy(false);
    }
  };

  /** 复制 8 位口令取图码 */
  const copyCode = () => {
    if (!item?.code) return;
    Taro.setClipboardData({
      data: item.code,
      success: () => toast.success('口令码已复制'),
    });
  };

  if (loading) {
    return (
      <View className="min-h-screen bg-white p-4">
        <Skeleton className="h-96 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-6 w-2/3 rounded-md" />
        <Skeleton className="mt-2 h-4 w-1/2 rounded-md" />
      </View>
    );
  }

  if (!item) {
    return (
      <View className="flex min-h-screen flex-col items-center justify-center bg-white">
        <Text className="block text-sm text-gray-400">素材不存在或已下架</Text>
      </View>
    );
  }

  return (
    <View className="min-h-screen bg-white">
      {/* 大图预览（免费，但叠加半透明水印遮罩保护；解锁后去水印） */}
      <View className="relative bg-slate-50">
        <Image
          className="w-full"
          mode="widthFix"
          src={assetUrl(item.url)}
          onClick={() => Taro.previewImage({ urls: [assetUrl(item.url)] })}
        />
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

      <View className="px-4 py-4">
        <View className="flex flex-row items-center justify-between">
          <Text className="block flex-1 pr-2 text-lg font-bold text-gray-800">{item.title}</Text>
          <Button
            size="sm"
            variant={liked ? 'default' : 'ghost'}
            className="shrink-0 rounded-full"
            onClick={onLike}
          >
            <Heart size={16} color={liked ? '#ffffff' : '#94a3b8'} />
            <Text className={`block ${liked ? 'text-white' : 'text-slate-400'}`}>{liked ? '已喜欢' : '喜欢'}</Text>
          </Button>
        </View>
        <View className="mt-2 flex flex-row flex-wrap gap-2">
          {item.tags?.map((tag) => (
            <View key={tag} className="rounded-full bg-slate-100 px-3 py-1">
              <Text className="block text-xs text-gray-500">{tag}</Text>
            </View>
          ))}
        </View>
        <View className="mt-3 flex flex-row items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <Text className="block flex-1 text-xs text-gray-500">
            口令取图码：
            <Text className="block text-base font-semibold tracking-widest text-blue-600">{item.code || '--'}</Text>
          </Text>
          {item.code ? (
            <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={copyCode}>
              <Text className="block text-xs text-blue-500">复制</Text>
            </Button>
          ) : null}
        </View>

        {/* 页面内 Banner 广告位（配置了流量主 ID 才显示，未开通前完全隐藏；ID 可由后台动态下发） */}
        {isWeapp && (getPublicConfig()?.bannerAdId || BANNER_AD_ID) ? (
          <View className="mt-5 overflow-hidden rounded-xl">
            <Ad unitId={getPublicConfig()?.bannerAdId || BANNER_AD_ID} adIntervals={30} />
          </View>
        ) : null}
      </View>

      {/* 固定底部操作栏：分享 + 下载 */}
      <View
        style={{
          position: 'fixed',
          bottom: 50,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'row',
          gap: 12,
          padding: '12px 16px',
          backgroundColor: '#ffffff',
          borderTop: '1px solid #f1f5f9',
          zIndex: 10,
        }}
      >
        <View className="flex-1">
          <NativeBtn
            className="flex h-full w-full items-center justify-center gap-1 normal-case"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 999,
              border: '1px solid #e2e8f0',
              lineHeight: 1,
            }}
            openType="share"
          >
            <Share2 size={18} color="#4c9df5" />
            <Text className="block text-blue-500">分享</Text>
          </NativeBtn>
        </View>
        <Button
          className="flex-1 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
          onClick={onDownloadClick}
        >
          <Download size={18} color="#fff" />
          <Text className="block text-white">保存无水印原图</Text>
        </Button>
      </View>

      {/* 激励视频解锁弹层（非强制，可关闭） */}
      <Dialog open={lockOpen} onOpenChange={setLockOpen}>
        <DialogContent className="rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex flex-row items-center gap-2">
              <Lock size={18} color="#4c9df5" />
              <Text className="block text-lg font-bold">解锁无水印原图</Text>
            </DialogTitle>
            <DialogDescription>
              <Text className="block text-sm text-gray-500">
                观看一段激励视频即可免费解锁下载到相册，感谢支持～
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

export default DetailPage;