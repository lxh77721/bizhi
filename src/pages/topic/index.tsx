import { useState } from 'react';
import { View, Text, Image, Navigator, ScrollView } from '@tarojs/components';
import Taro, {
  useLoad,
  useRouter,
  useShareAppMessage,
  useShareTimeline,
} from '@tarojs/taro';
import { CircleAlert } from 'lucide-react-taro';
import { Network } from '@/network';
import { Skeleton } from '@/components/ui/skeleton';
import { assetUrl } from '@/utils/asset';

/**
 * 专题合集页
 * --------------------------------------------------------------------------
 * 为什么单独做一个页面：TabBar 页面（头像 / 壁纸）只能用 switchTab 打开且无法带参数，
 * 分类切换只能靠 JS 状态，不产生独立 URL，微信搜一搜无法为「某个分类」建立索引。
 * 本页把每个分类变成一个带参数的独立 URL（/pages/topic/index?category=xxx），
 * 既能承接该类目的长尾搜索词，又能作为内链枢纽帮助爬虫发现更多详情页。
 */

interface MaterialItem {
  id: string;
  title: string;
  category: string;
  thumbUrl: string;
  tags: string[];
}

interface Category {
  key: string;
  label: string;
  type?: 'avatar' | 'wallpaper';
}

export default function TopicPage() {
  const router = useRouter();
  // 分类 key 可能含中文（如 wallpaper_暗黑），URL 中需编码，这里做一次安全解码
  const rawCategory = router.params?.category || '';
  let categoryKey = rawCategory;
  try {
    categoryKey = decodeURIComponent(rawCategory);
  } catch {
    categoryKey = rawCategory;
  }

  const [list, setList] = useState<MaterialItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const current = categories.find((c) => c.key === categoryKey);
  const label = current?.label || '精选素材';
  const isWallpaper = (current?.type || 'avatar') === 'wallpaper';
  const kind = isWallpaper ? '壁纸' : '头像';

  useLoad(async () => {
    try {
      // 一次拉全量：既拿到本专题素材，也拿到全部分类用于交叉内链
      const res = await Network.request({ url: '/api/materials', method: 'GET' });
      const data = (res.data as any)?.data;
      const all: MaterialItem[] = data?.list || [];
      const cats: Category[] = data?.categories || [];
      setCategories(cats);
      setList(all.filter((m) => m.category === categoryKey));
      // 页面标题埋入具体类目词，让搜一搜能按「XX头像 / XX壁纸」这类词命中
      const matched = cats.find((c) => c.key === categoryKey);
      Taro.setNavigationBarTitle({
        title: `${matched?.label || '精选'}高清${kind} - 免费下载`,
      });
    } catch (err) {
      console.error('[topic] 加载失败', err);
      setList([]);
    } finally {
      setLoading(false);
    }
  });

  // 分享落地到当前专题（而非首页），接住对该类目感兴趣的人，提升回流转化
  const sharePath = `/pages/topic/index?category=${encodeURIComponent(categoryKey)}`;
  const shareImage = list[0]?.thumbUrl ? assetUrl(list[0].thumbUrl) : undefined;

  useShareAppMessage(() => ({
    title: `精选${label}合集 - 免费高清${kind}下载`,
    path: sharePath,
    imageUrl: shareImage,
  }));

  useShareTimeline(() => ({
    title: `精选${label}合集 - 免费高清${kind}下载`,
    imageUrl: shareImage,
  }));

  const leftCol = list.filter((_, i) => i % 2 === 0);
  const rightCol = list.filter((_, i) => i % 2 === 1);
  // 其它专题：专题之间互相内链，帮助爬虫遍历全部类目页
  const otherCategories = categories.filter((c) => c.key !== categoryKey);

  return (
    <View className="min-h-screen bg-white">
      {/* 专题头部：自然语言描述，为搜一搜提供可读的页面文本（不做关键词堆砌） */}
      <View className="bg-slate-50 px-4 py-4">
        <Text className="block text-lg font-bold text-gray-800">{label}合集</Text>
        <Text className="mt-1 block text-xs text-gray-500">
          {loading ? '正在加载精选素材…' : `精选 ${list.length} 张${label}，全部免费保存到相册，持续更新。`}
        </Text>
      </View>

      {/* 素材瀑布流：用 Navigator 组件跳转，微信爬虫可沿链接发现详情页 */}
      <View className="px-4 pt-3 pb-4">
        {loading ? (
          <View className="flex flex-row gap-3">
            <View className="flex flex-1 flex-col">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="mb-3 h-48 w-full rounded-2xl" />
              ))}
            </View>
            <View className="flex flex-1 flex-col">
              {[3, 4, 5].map((i) => (
                <Skeleton key={i} className="mb-3 h-48 w-full rounded-2xl" />
              ))}
            </View>
          </View>
        ) : list.length === 0 ? (
          <View className="flex flex-col items-center py-20">
            <CircleAlert size={40} color="#d1d5db" />
            <Text className="block mt-3 text-sm text-gray-400">该专题还没有素材</Text>
          </View>
        ) : (
          <View className="flex flex-row gap-3">
            <View className="flex flex-1 flex-col">
              {leftCol.map((item) => (
                <Navigator
                  key={item.id}
                  url={`/pages/detail/index?id=${item.id}`}
                  className="mb-3 block overflow-hidden rounded-2xl bg-white shadow-sm"
                  hoverClass="opacity-90"
                >
                  <Image className="w-full" mode="widthFix" src={assetUrl(item.thumbUrl)} lazyLoad />
                </Navigator>
              ))}
            </View>
            <View className="flex flex-1 flex-col">
              {rightCol.map((item) => (
                <Navigator
                  key={item.id}
                  url={`/pages/detail/index?id=${item.id}`}
                  className="mb-3 block overflow-hidden rounded-2xl bg-white shadow-sm"
                  hoverClass="opacity-90"
                >
                  <Image className="w-full" mode="widthFix" src={assetUrl(item.thumbUrl)} lazyLoad />
                </Navigator>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* 其它专题：横向内链，既是用户的下一步，也是爬虫的下一站 */}
      {otherCategories.length > 0 ? (
        <View className="px-4 pb-8">
          <Text className="block text-sm font-semibold text-gray-800">其它专题</Text>
          <ScrollView scrollX className="mt-3 whitespace-nowrap" enhanced showScrollbar={false}>
            <View className="flex flex-row gap-2">
              {otherCategories.map((c) => (
                <Navigator
                  key={c.key}
                  url={`/pages/topic/index?category=${encodeURIComponent(c.key)}`}
                  className="shrink-0 rounded-full bg-slate-50 px-4 py-2"
                  hoverClass="opacity-90"
                >
                  <Text className="block text-xs text-gray-600">
                    {/* 分类名已含「头像/壁纸」时不再追加，避免出现「女生头像头像」 */}
                    {/头像|壁纸/.test(c.label)
                      ? c.label
                      : `${c.label}${(c.type || 'avatar') === 'wallpaper' ? '壁纸' : '头像'}`}
                  </Text>
                </Navigator>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
