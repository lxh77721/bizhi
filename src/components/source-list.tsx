import { useState, useCallback } from 'react';
import { View, Text, Image, ScrollView, Ad } from '@tarojs/components';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { Search, CircleAlert } from 'lucide-react-taro';
import { Network } from '@/network';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { BANNER_AD_ID } from '@/constants/ad';
import { assetUrl } from '@/utils/asset';

/**
 * 通用素材瀑布流列表页（头像 / 壁纸频道共用）
 * 通过 type 区分：avatar=来自点头像站、wallpaper=来自壁纸站。
 */
interface Item {
  id: string;
  title: string;
  category: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  tags: string[];
}

interface Cat {
  key: string;
  label: string;
}

const ALL_CATEGORY = { key: 'all', label: '全部' } as Cat;

const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP;

export default function SourceList({
  type,
  title,
}: {
  type: 'avatar' | 'wallpaper';
  title: string;
}) {
  const [keyword, setKeyword] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [list, setList] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);

  useShareAppMessage(() => ({
    title: `免费${title}大全 - 高清${title}、情侣${title}、手机${title}`,
    path: '/pages/index/index',
  }));

  const fetchMaterials = useCallback(
    async (cat: string, kw: string) => {
      setLoading(true);
      try {
        const res = await Network.request({
          url: '/api/materials',
          method: 'GET',
          data: { type, category: cat, keyword: kw },
        });
        const d = (res.data as any)?.data;
        setList(d?.list || []);
        setCategories(
          (d?.categories || []).filter((c: any) => (c?.type ? c.type === type : type === 'avatar')),
        );
      } catch (err) {
        console.error(`[${title}] 加载素材失败`, err);
        setList([]);
      } finally {
        setLoading(false);
      }
    },
    [type, title],
  );

  Taro.useDidShow(() => {
    fetchMaterials(activeCategory, keyword);
  });

  const onCategoryChange = (key: string) => {
    setActiveCategory(key);
    fetchMaterials(key, keyword);
  };

  const onSearch = () => {
    fetchMaterials(activeCategory, keyword);
  };

  const goDetail = (item: Item) => {
    Taro.navigateTo({ url: `/pages/detail/index?id=${item.id}` });
  };

  const leftCol = list.filter((_, i) => i % 2 === 0);
  const rightCol = list.filter((_, i) => i % 2 === 1);

  const renderCard = (item: Item) => (
    <View
      key={item.id}
      className="mb-3 overflow-hidden rounded-2xl bg-white shadow-sm"
      onClick={() => goDetail(item)}
      hoverClass="opacity-90"
    >
      <Image className="w-full" mode="widthFix" src={assetUrl(item.thumbUrl)} lazyLoad />
    </View>
  );

  const renderSkeleton = () =>
    [0, 1, 2, 3, 4, 5].map((i) => (
      <Skeleton key={i} className={`mb-3 w-full rounded-2xl ${i % 3 === 0 ? 'h-52' : i % 3 === 1 ? 'h-40' : 'h-60'}`} />
    ));

  return (
    <View className="min-h-screen bg-white">
      {/* 搜索框 */}
      <View className="flex flex-row items-center gap-2 px-4 pt-4">
        <View className="flex flex-1 flex-row items-center gap-2 rounded-full bg-slate-50 px-4 py-2">
          <Search size={18} color="#9ca3af" />
          <Input
            className="flex-1 bg-transparent text-sm"
            placeholder={`搜索${title}，如“治愈”“简约”`}
            value={keyword}
            confirmType="search"
            onInput={(e) => setKeyword((e as any).detail?.value || '')}
            onConfirm={onSearch}
          />
        </View>
      </View>

      {/* 分类导航标签 */}
      <ScrollView scrollX className="mt-3 whitespace-nowrap" enhanced showScrollbar={false}>
        <View className="flex flex-row gap-2 px-4">
          {[ALL_CATEGORY, ...categories].map((cat) => (
            <Button
              key={cat.key}
              size="sm"
              variant={activeCategory === cat.key ? 'default' : 'outline'}
              className={`shrink-0 rounded-full px-4 ${activeCategory === cat.key ? '' : 'bg-slate-50'}`}
              onClick={() => onCategoryChange(cat.key)}
            >
              <Text className="block">{cat.label}</Text>
            </Button>
          ))}
        </View>
      </ScrollView>

      {/* 瀑布流 */}
      <View className="px-4 pt-3 pb-4">
        {loading ? (
          <View className="flex flex-row gap-3">
            <View className="flex flex-1 flex-col">{renderSkeleton().slice(0, 3)}</View>
            <View className="flex flex-1 flex-col">{renderSkeleton().slice(3, 6)}</View>
          </View>
        ) : list.length === 0 ? (
          <View className="flex flex-col items-center py-20">
            <CircleAlert size={40} color="#d1d5db" />
            <Text className="block mt-3 text-sm text-gray-400">还没有{title}素材，去后台抓取一些吧</Text>
          </View>
        ) : (
          <View className="flex flex-row gap-3">
            <View className="flex flex-1 flex-col">{leftCol.map(renderCard)}</View>
            <View className="flex flex-1 flex-col">{rightCol.map(renderCard)}</View>
          </View>
        )}
      </View>

      {/* 底部常驻 Banner 广告位 */}
      <View
        style={{
          position: 'fixed',
          bottom: 50,
          left: 0,
          right: 0,
          backgroundColor: '#ffffff',
          padding: '8px 12px',
          zIndex: 10,
        }}
      >
        {isWeapp && BANNER_AD_ID ? <Ad unitId={BANNER_AD_ID} adIntervals={30} /> : null}
      </View>
    </View>
  );
}