export default typeof definePageConfig === 'function'
  ? definePageConfig({
      // 标题埋入搜一搜长尾词，提升「壁纸」类词命中
      navigationBarTitleText: '壁纸大全 - 治愈风景/极简文字/高清手机壁纸免费下载',
      // 开启分享：壁纸页是最高频的转发内容页，必须开放转发与朋友圈
      enableShareAppMessage: true,
      enableShareTimeline: true,
    })
  : {
      navigationBarTitleText: '壁纸大全 - 治愈风景/极简文字/高清手机壁纸免费下载',
      enableShareAppMessage: true,
      enableShareTimeline: true,
    }
