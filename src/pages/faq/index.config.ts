export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '常见问题' })
  : { navigationBarTitleText: '常见问题' }