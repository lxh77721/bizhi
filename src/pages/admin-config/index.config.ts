export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '系统配置' })
  : { navigationBarTitleText: '系统配置' };
