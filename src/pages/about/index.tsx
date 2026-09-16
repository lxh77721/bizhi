import { View, Text } from '@tarojs/components';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { Mail, ShieldCheck, Info, HandHeart } from 'lucide-react-taro';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import './index.css';

/**
 * 侵权投诉 / 反馈邮箱（请改为你自己的真实邮箱）
 */
const CONTACT_EMAIL = 'support@example.com'; // TODO: 替换为你的侵权投诉邮箱

const AboutPage = () => {
  useShareAppMessage(() => ({
    title: '「AI头像壁纸大全」超多原创头像与治愈壁纸，免费逛',
    path: '/pages/about/index',
  }));

  const onMail = () => {
    Taro.setClipboardData({
      data: CONTACT_EMAIL,
      success: () => Taro.showToast({ title: '邮箱已复制', icon: 'success' }),
    });
  };

  return (
    <View className="min-h-screen bg-white px-4 py-6">
      <Text className="block text-xl font-bold text-gray-800">关于「AI头像壁纸大全」</Text>
      <Text className="block mt-1 text-sm text-gray-500">
        AI 头像、手机壁纸、情侣头像、治愈壁纸一站式免费浏览与下载
      </Text>

      {/* 简介 */}
      <Card className="mt-5 rounded-2xl border-0 shadow-sm">
        <CardContent className="p-4">
          <View className="flex flex-row items-start gap-3">
            <HandHeart size={20} color="#4c9df5" className="mt-1 shrink-0" />
            <View>
              <Text className="block text-base font-semibold text-gray-800">小程序简介</Text>
              <Text className="block mt-1 text-sm leading-relaxed text-gray-500">
                「AI头像壁纸大全」为你提供海量原创 AI 头像、手机壁纸、情侣头像与治愈风景壁纸。
                基础浏览全部免费；仅“高清无水印原图下载”需观看一段激励视频解锁，感谢理解与支持。
              </Text>
            </View>
          </View>
        </CardContent>
      </Card>

      {/* 免责声明 */}
      <Card className="mt-3 rounded-2xl border-0 shadow-sm">
        <CardContent className="p-4">
          <View className="flex flex-row items-start gap-3">
            <Info size={20} color="#4c9df5" className="mt-1 shrink-0" />
            <View>
              <Text className="block text-base font-semibold text-gray-800">免责声明</Text>
              <Text className="block mt-1 text-sm leading-relaxed text-gray-500">
                1. 本站所有素材均由 AI 生成或来自 CC0 商用图片库，仅供个人非商用使用。
                {'\n'}
                2. 如需商用或用于其他场景，请自行确认素材版权及合规情况。
                {'\n'}
                3. 若您认为本站素材侵犯了您的合法权益，请通过下方邮箱与我们联系，我们将在核实后第一时间下架。
              </Text>
            </View>
          </View>
        </CardContent>
      </Card>

      {/* 侵权投诉入口 */}
      <Card className="mt-3 rounded-2xl border-0 shadow-sm">
        <CardContent className="p-4">
          <View className="flex flex-row items-center gap-3">
            <Mail size={20} color="#4c9df5" className="shrink-0" />
            <Text className="block flex-1 text-sm text-gray-600">
              侵权投诉 / 意见反馈邮箱
            </Text>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 rounded-full"
              onClick={onMail}
            >
              <Text className="block text-blue-500">复制邮箱</Text>
            </Button>
          </View>
          <Text className="block mt-2 text-xs text-gray-400">{CONTACT_EMAIL}</Text>
        </CardContent>
      </Card>

      {/* 流量主合规提示 */}
      <Card className="mt-3 rounded-2xl border-0 shadow-sm">
        <CardContent className="p-4">
          <View className="flex flex-row items-start gap-3">
            <ShieldCheck size={20} color="#4c9df5" className="mt-1 shrink-0" />
            <View>
              <Text className="block text-base font-semibold text-gray-800">流量主合规说明</Text>
              <Text className="block mt-1 text-sm leading-relaxed text-gray-500">
                本小程序严格遵从微信流量主规范：
                {'\n'}
                · 基础浏览完全免费，不强制看广告才能浏览图片
                {'\n'}
                · 广告仅用于“解锁高清原图下载”，需用户主动点击观看
                {'\n'}
                · 不自动弹出广告、广告不铺满屏幕、不做强制分享
                {'\n'}
                · 不采集任何用户隐私信息
              </Text>
            </View>
          </View>
        </CardContent>
      </Card>

      <Text className="block mt-8 text-center text-xs text-gray-400">
        AI头像壁纸大全 · 让每一张图都治愈你
      </Text>
    </View>
  );
};

export default AboutPage;