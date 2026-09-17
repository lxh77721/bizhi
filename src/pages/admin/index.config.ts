export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '管理后台' })
  : { navigationBarTitleText: '管理后台' }