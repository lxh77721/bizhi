export default typeof definePageConfig === 'function'
  ? definePageConfig({
      // 标题埋入「怎么下载 / 能不能商用」这类长尾问句词，让搜一搜能按问题命中本页
      navigationBarTitleText: '常见问题 - 头像壁纸怎么下载、能商用吗',
      enableShareAppMessage: true,
      enableShareTimeline: true,
    })
  : {
      navigationBarTitleText: '常见问题 - 头像壁纸怎么下载、能商用吗',
      enableShareAppMessage: true,
      enableShareTimeline: true,
    };
