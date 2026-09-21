import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import { ChevronDown } from 'lucide-react-taro';

const FAQS = [
  { q: '如何下载高清原图？', a: '打开任意素材详情页，点击“保存无水印原图”，观看一条激励视频即可保存到相册；基础浏览始终免费。' },
  { q: '点赞与下载记录存在哪里？', a: '记录与当前设备关联（无需注册），更换设备或清除缓存后历史记录不会保留。' },
  { q: '什么是“口令取图”？', a: '每张素材都有 8 位口令取图码，在「我的 → 口令取图」输入他人分享的口令码，即可直接定位到对应素材。' },
  { q: '素材可以商用吗？', a: '本站素材由原创或来自 CC0 素材库，仅供个人浏览下载；商用请自行确认版权。' },
  { q: '遇到侵权或问题如何反馈？', a: '请通过「我的 → 侵权投诉 / 反馈」复制邮箱与我们联系，我们会在核实后尽快处理。' },
];

export default function Faq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <View className="min-h-screen bg-white px-4 py-4">
      <Text className="block text-lg font-bold text-gray-800 mb-4">常见问题</Text>
      {FAQS.map((f, i) => (
        <View key={i} className="border-b border-slate-100 py-3 last:border-0">
          <View
            className="flex flex-row items-center justify-between"
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
          >
            <Text className="block flex-1 text-sm text-gray-700 pr-2">{f.q}</Text>
            <ChevronDown size={16} color="#94a3b8" className={openIdx === i ? 'rotate-180' : ''} />
          </View>
          {openIdx === i ? (
            <Text className="block mt-2 text-xs leading-relaxed text-gray-500">{f.a}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}