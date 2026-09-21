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
import './index.css';

/**
 * 素材数据类型（与后端 materials.data 对应）
 */
interface MaterialItem {
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
}

const ALL_CATEGORY = { key: 'all', label: '全部' } as Category;

/**
 * 流量主 Banner 广告位 ID 见 @/constants/ad.ts（未开通前留空，页面自动隐藏 Banner）
 */

/** 平台检测：仅微信小程序支持原生 <Ad>，其它端不渲染以免报错 */
const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP;

const IndexPage = () => {
  const [keyword, setKeyword] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [list, setList] = useState<MaterialItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // 首页分享：社交裂变引流（标题埋关键词）——通过右上角菜单转发
  useShareAppMessage(() => ({
    title: '头像壁纸大全 - 超多免费头像、情侣头像、治愈壁纸',
    path: '/pages/index/index',
  }));

  /** 拉取素材列表（支持分类 + 关键词） */
  const fetchMaterials = useCallback(async (category: string, kw: string) => {
    setLoading(true);
    try {
      const res = await Network.request({
        url: '/api/materials',
        method: 'GET',
        data: { category, keyword: kw },
      });
      // 后端返回 { status, data: { list, categories } }
      const data = (res.data as any)?.data;
      setList(data?.list || []);
      setCategories(data?.categories || []);
    } catch (err) {
      console.error('[index] 加载素材失败', err);
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次进入 / 切回本 Tab 时加载
  Taro.useDidShow(() => {
    fetchMaterials(activeCategory, keyword);
  });

  /** 分类切换 */
  const onCategoryChange = (key: string) => {
    setActiveCategory(key);
    fetchMaterials(key, keyword);
  };

  /** 搜索（键盘确认触发） */
  const onSearch = () => {
    fetchMaterials(activeCategory, keyword);
  };

  /** 进入详情预览页 */
  const goDetail = (item: MaterialItem) => {
    Taro.navigateTo({ url: `/pages/detail/index?id=${item.id}` });
  };

  // 瀑布流：按奇偶索引分成左右两列，形成错落布局
  const leftCol = list.filter((_, i) => i % 2 === 0);
  const rightCol = list.filter((_, i) => i % 2 === 1);

  const renderCard = (item: MaterialItem) => (
    <View
      key={item.id}
      className="mb-3 overflow-hidden rounded-2xl bg-white shadow-sm"
      onClick={() => goDetail(item)}
      hoverClass="opacity-90"
    >
      <Image
        className="w-full"
        mode="widthFix"
        src={assetUrl(item.thumbUrl)}
        lazyLoad
      />
    </View>
  );

  const renderSkeleton = () =>
    [0, 1, 2, 3, 4, 5].map((i) => (
      <Skeleton
        key={i}
        className={`mb-3 w-full rounded-2xl ${i % 3 === 0 ? 'h-52' : i % 3 === 1 ? 'h-40' : 'h-60'}`}
      />
    ));

  return (
    <View className="min-h-screen bg-white">
      {/* 顶部：搜索框 */}
      <View className="px-4 pt-4">
        <View className="flex flex-row items-center gap-2 rounded-full bg-slate-50 px-4 py-2">
          <Search size={18} color="#9ca3af" />
          <Input
            className="flex-1 bg-transparent text-sm"
            placeholder="搜索头像 / 壁纸，如“情侣”“治愈风景”"
            value={keyword}
            confirmType="search"
            onInput={(e) => setKeyword((e as any).detail?.value || '')}
            onConfirm={onSearch}
          />
        </View>
      </View>

      {/* 分类导航标签（横向滚动） */}
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

      {/* 素材瀑布流 */}
      <View className="px-4 pt-3 pb-4">
        {loading ? (
          <View className="flex flex-row gap-3">
            <View className="flex flex-1 flex-col">{renderSkeleton().slice(0, 3)}</View>
            <View className="flex flex-1 flex-col">{renderSkeleton().slice(3, 6)}</View>
          </View>
        ) : list.length === 0 ? (
          <View className="flex flex-col items-center py-20">
            <CircleAlert size={40} color="#d1d5db" />
            <Text className="block mt-3 text-sm text-gray-400">
              没有找到相关素材，换个关键词试试
            </Text>
          </View>
        ) : (
          <View className="flex flex-row gap-3">
            <View className="flex flex-1 flex-col">{leftCol.map(renderCard)}</View>
            <View className="flex flex-1 flex-col">{rightCol.map(renderCard)}</View>
          </View>
        )}
      </View>

      {/* 底部常驻 Banner 广告位（不遮挡内容与按钮） */}
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
        {isWeapp && BANNER_AD_ID ? (
          <Ad unitId={BANNER_AD_ID} adIntervals={30} />
        ) : null}
      </View>
    </View>
  );
};

export default IndexPage;