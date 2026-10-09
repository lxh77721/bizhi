import { useState } from 'react';
import { View, Text } from '@tarojs/components';
import { useShareAppMessage, useShareTimeline } from '@tarojs/taro';
import { ChevronDown } from 'lucide-react-taro';

const FAQS = [
  { q: '如何下载高清原图？', a: '打开任意素材详情页，点击“保存无水印原图”，观看一条激励视频即可保存到相册；基础浏览始终免费。' },
  { q: '点赞与下载记录存在哪里？', a: '记录与当前设备关联（无需注册），更换设备或清除缓存后历史记录不会保留。' },
  { q: '什么是“口令取图”？', a: '每张素材都有 8 位口令取图码，在「我的 → 口令取图」输入他人分享的口令码，即可直接定位到对应素材。' },
  { q: '素材可以商用吗？', a: '本站素材仅供个人浏览与下载使用；如需商用请自行确认授权与版权归属。' },
  { q: '遇到侵权或问题如何反馈？', a: '请通过「我的 → 侵权投诉 / 反馈」复制邮箱与我们联系，我们会在核实后尽快处理。' },
];

export default function Faq() {
  /**
   * 默认「全部展开」，而不是只展开第一条。
   * 原因：答案必须出现在初始渲染结果里 —— 微信搜一搜的爬虫不执行 JS，
   * 用条件渲染（{open ? <Text/> : null}）写答案，爬虫抓到的页面只有问题、没有答案，
   * 页面会因「内容单薄」而拿不到收录。默认展开后用户与爬虫所见完全一致，
   * 也满足官方「爬虫抓到的内容需与真实用户呈现一致」的要求。
   */
  const [openSet, setOpenSet] = useState<number[]>(FAQS.map((_, i) => i));

  const toggle = (i: number) =>
    setOpenSet((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  // 分享落地到 FAQ 页本身，接住「怎么下载/能不能商用」这类长尾问题的搜索与转发
  useShareAppMessage(() => ({
    title: '头像壁纸怎么下载、能不能商用？常见问题一次说清',
    path: '/pages/faq/index',
  }));

  useShareTimeline(() => ({
    title: '头像壁纸下载与使用的常见问题',
  }));

  return (
    <View className="min-h-screen bg-white px-4 py-4">
      {/* 首屏导语：给爬虫一段有信息量的正文，避免整页只有一堆问题标题 */}
      <Text className="block text-lg font-bold text-gray-800">常见问题</Text>
      <Text className="mb-4 mt-1 block text-xs leading-relaxed text-gray-500">
        关于头像壁纸的下载方式、记录保存、口令取图、使用范围与反馈渠道，下面这些问题都做了说明。
      </Text>

      {FAQS.map((f, i) => {
        const open = openSet.includes(i);
        return (
          <View key={i} className="border-b border-slate-100 py-3 last:border-0">
            <View className="flex flex-row items-center justify-between" onClick={() => toggle(i)}>
              <Text className="block flex-1 pr-2 text-sm text-gray-700">{f.q}</Text>
              <ChevronDown size={16} color="#94a3b8" className={open ? 'rotate-180' : ''} />
            </View>
            {/* 用 display 控制显隐而非条件渲染，保证答案始终在 DOM 中可被抓取 */}
            <View className={open ? 'block' : 'hidden'}>
              <Text className="mt-2 block text-xs leading-relaxed text-gray-500">{f.a}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
