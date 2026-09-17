export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/ai/index',
    'pages/about/index',
    'pages/detail/index',
    'pages/admin/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: 'AI头像壁纸大全',
    navigationBarTextStyle: 'black'
  },
  tabBar: {
    color: '#9ca3af',
    selectedColor: '#4c9df5',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: './assets/tabbar/house.png',
        selectedIconPath: './assets/tabbar/house-active.png'
      },
      {
        pagePath: 'pages/ai/index',
        text: 'AI生成',
        iconPath: './assets/tabbar/sparkles.png',
        selectedIconPath: './assets/tabbar/sparkles-active.png'
      },
      {
        pagePath: 'pages/about/index',
        text: '关于',
        iconPath: './assets/tabbar/info.png',
        selectedIconPath: './assets/tabbar/info-active.png'
      }
    ]
  }
})