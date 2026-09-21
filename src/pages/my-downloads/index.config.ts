export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '我的下载' })
  : { navigationBarTitleText: '我的下载' }