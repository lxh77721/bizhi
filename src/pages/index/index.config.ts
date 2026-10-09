export default definePageConfig({
  // 标题埋入搜一搜关键词
  navigationBarTitleText: '头像壁纸大全 - 头像/壁纸/情侣头像',
  enablePullDownRefresh: false,
  // 关键：不开启则右上角「转发」为灰色不可点，页面内的 useShareAppMessage 也不会生效
  enableShareAppMessage: true,
  enableShareTimeline: true,
})