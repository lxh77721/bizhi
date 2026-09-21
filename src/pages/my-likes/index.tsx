import { useState, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import { fetchLikes, isLogged, MaterialItem } from '@/services/user';
import MediaGrid from '@/components/media-grid';

export default function MyLikes() {
  const [logged] = useState(isLogged());
  const [items, setItems] = useState<MaterialItem[]>([]);

  useEffect(() => {
    if (!logged) return;
    fetchLikes().then(setItems).catch(() => {});
  }, [logged]);

  return (
    <View className="min-h-screen bg-white px-4 py-4">
      {!logged ? (
        <View className="flex flex-col items-center justify-center py-24">
          <Text className="block text-sm text-gray-400">登录后可在「我的」查看喜欢</Text>
          <Text className="block mt-1 text-sm text-gray-500">请先到「我的」页登录</Text>
        </View>
      ) : (
        <MediaGrid items={items} empty="还没有喜欢过素材，去首页逛逛吧" />
      )}
    </View>
  );
}