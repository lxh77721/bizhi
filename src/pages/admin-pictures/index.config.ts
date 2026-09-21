export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '图片管理' })
  : { navigationBarTitleText: '图片管理' };
