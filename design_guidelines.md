# 设计指南 (design_guidelines)

> 项目：简影壁纸馆（头像/壁纸素材小程序 · 微信小程序 · 流量主变现）
> 风格：简约清新 · 白色背景 · 圆角卡片 · 两列瀑布流 · 移动端优先

## 品牌定位
清新、治愈的"头像/壁纸素材小画廊"，浏览免费、看激励视频解锁高清下载。目标用户在微信搜一搜搜索"头像、壁纸、情侣头像、手机壁纸、女生头像、治愈壁纸"等词进入。

## 配色方案（Tailwind 类名）
- 品牌主色：`#4C9DF5`（清新天蓝）→ `bg-blue-500` / `text-blue-500` / `ring-blue-500`
- 品牌渐变：`from-cyan-400 to-blue-500`（主 CTA 用）
- 背景：`bg-white`；次级底 `bg-slate-50`（`#F5F7FB` 用 `bg-slate-50`）
- 主文本：`text-gray-800`（`#1F2937`）；次要 `text-gray-500`（`#6B7280`）
- 推荐/解锁按钮：`bg-amber-500`（`#FF9F43` 暖橙）
- 成功：`text-emerald-500`；边框 `border-slate-200`

## 组件选型原则（CRITICAL）
- 通用 UI 组件统一从 `@/components/ui/*` 导入，禁止用 `View/Text` 手搓按钮、输入框、卡片、标签、弹窗、Toast、Tabs（缺失时先补齐到 components/ui 再引用）。
- 新页面必须先拆 UI 单元 → 映射到组件库，再编码：
  - 搜索框 → `@/components/ui/input`（+ `InputGroup`）
  - 分类导航标签 → `@/components/ui/tabs` / pill 型 button
  - 卡片 → `@/components/ui/card`
  - 下载/解锁按钮 → `@/components/ui/button`
  - 激励视频解锁弹层 → `@/components/ui/dialog`
  - 加载/空状态 → `@/components/ui/skeleton`
  - 提示 → `@/components/ui/toast` / `sonner`
- TabBar / 瀑布流图片墙 / 广告位容器属于页面结构，可用 `@tarojs/components`（View/Image/Text/ScrollView）。

## 容器与卡片
- 卡片：`bg-white rounded-2xl shadow-sm overflow-hidden`（圆角相框感）。
- 页面容器：`bg-white min-h-screen px-4`（画廊白墙 + 左右留白）。
- 输入框容器：`bg-slate-50 rounded-full px-4 py-2.5`。

## 间距系统（Tailwind）
- 页面左右内边距：`px-4`
- 卡片间距：瀑布流 `gap-3`；横向标签 `gap-2`
- 区块间距：`mb-5` / `space-y-4`
- 固定底部操作栏：inline style（避开 TabBar `bottom: 50`）

## 字体排版
- 页面标题：`text-xl font-bold text-gray-800`
- 卡片副文案：`text-sm`；标签：`text-xs text-gray-500`
- 全部使用 `block` 类避免 H5 白屏。

## 导航结构
- 4 个 TabBar 页面：首页(`pages/index/index`)、头像(`pages/avatar/index`)、壁纸(`pages/wallpaper/index`)、我的(`pages/about/index`)
- 子页面：素材详情(`pages/detail/index`)——普通跳转，不进 TabBar
- TabBar 跳转用 `switchTab`，普通页面用 `navigateTo`
- TabBar 图标：本地 PNG（`./assets/tabbar/*`），用 lucide 工具生成

## 空状态 / 加载态
- 加载：`@/components/ui/skeleton` 卡片占位
- 空态：居中灰字 `text-gray-400` + 一句话说明

## 广告合规（CRITICAL）
- 底部常驻 1 条 banner（`ad` 组件占位，注释标明接入点），不遮按钮、不自动弹出
- 激励视频仅用于"解锁高清原图下载"，观看后返回 `onClose` 回掉保存图片
- 浏览预览图完全免费，不做强制分享 / 强制看广告解锁浏览

## 小程序约束
- 图片一律使用对象存储/图库 URL，禁止打包大图进包（TabBar 图标除外）
- 搜一搜关键词埋入页面标题与 about 文案
- banner/ad 用 `wx` 原生《ad》占位，接入时替换为真实广告位 id；激励视频用 `Taro.createRewardedVideoAd`