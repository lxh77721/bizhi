export default typeof definePageConfig === 'function'
  ? definePageConfig({
      // 标题埋入搜一搜长尾词，提升「头像」类词命中
      navigationBarTitleText: '头像大全 - 女生头像/男生头像/情侣头像免费下载',
      // 开启分享：头像页是最容易被转发的内容页，必须开放转发与朋友圈
      enableShareAppMessage: true,
      enableShareTimeline: true,
    })
  : {
      navigationBarTitleText: '头像大全 - 女生头像/男生头像/情侣头像免费下载',
      enableShareAppMessage: true,
      enableShareTimeline: true,
    }
