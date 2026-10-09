export default typeof definePageConfig === 'function'
  ? definePageConfig({
      // 兜底标题，进入页面后会按具体分类用 setNavigationBarTitle 覆盖
      navigationBarTitleText: '精选头像壁纸合集 - 免费高清下载',
      enableShareAppMessage: true,
      enableShareTimeline: true,
    })
  : {
      navigationBarTitleText: '精选头像壁纸合集 - 免费高清下载',
      enableShareAppMessage: true,
      enableShareTimeline: true,
    }
