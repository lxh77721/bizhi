import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { assetUrl } from '@/utils/asset';
import { MaterialItem } from '@/services/user';

export default function MediaGrid({ items, empty }: { items: MaterialItem[]; empty: string }) {
  if (!items || !items.length) {
    return (
      <View className="flex flex-col items-center justify-center py-20">
        <Text className="block text-sm text-gray-400">{empty}</Text>
      </View>
    );
  }
  const left = items.filter((_, i) => i % 2 === 0);
  const right = items.filter((_, i) => i % 2 === 1);
  const go = (it: MaterialItem) => Taro.navigateTo({ url: `/pages/detail/index?id=${it.id}` });
  return (
    <View className="flex flex-row gap-2">
      {[left, right].map((col, ci) => (
        <View key={ci} className="flex-1">
          {col.map((it) => (
            <Image
              key={it.id}
              className="mb-2 w-full rounded-xl"
              mode="widthFix"
              src={assetUrl(it.thumbUrl)}
              lazyLoad
              onClick={() => go(it)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}