export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '壁纸大全' })
  : { navigationBarTitleText: '壁纸大全' }