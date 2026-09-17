export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '头像大全' })
  : { navigationBarTitleText: '头像大全' }