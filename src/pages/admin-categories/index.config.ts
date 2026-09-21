export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '分类管理' })
  : { navigationBarTitleText: '分类管理' };
