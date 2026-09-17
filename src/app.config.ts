export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/avatar/index',
    'pages/wallpaper/index',
    'pages/about/index',
    'pages/ai/index',
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
        pagePath: 'pages/avatar/index',
        text: '头像',
        iconPath: './assets/tabbar/user.png',
        selectedIconPath: './assets/tabbar/user-active.png'
      },
      {
        pagePath: 'pages/wallpaper/index',
        text: '壁纸',
        iconPath: './assets/tabbar/image.png',
        selectedIconPath: './assets/tabbar/image-active.png'
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