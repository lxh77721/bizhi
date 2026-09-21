export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '我的喜欢' })
  : { navigationBarTitleText: '我的喜欢' }