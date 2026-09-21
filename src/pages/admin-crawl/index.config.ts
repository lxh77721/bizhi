export default typeof definePageConfig === 'function'
  ? definePageConfig({ navigationBarTitleText: '抓取素材' })
  : { navigationBarTitleText: '抓取素材' };
