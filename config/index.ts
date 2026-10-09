import fs from 'node:fs';
import path from 'node:path';

import tailwindcss from '@tailwindcss/postcss';
import { UnifiedViteWeappTailwindcssPlugin } from 'weapp-tailwindcss/vite';
import { defineConfig, type UserConfigExport } from '@tarojs/cli';
import type { PluginItem } from '@tarojs/taro/types/compile/config/project';
import dotenv from 'dotenv';
import devConfig from './dev';
import prodConfig from './prod';
import pkg from '../package.json';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const resolvePort = (value: string | undefined, fallback: number): number => {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
};

const h5Port = resolvePort(process.env.PORT, 5000);
const serverPort = resolvePort(process.env.SERVER_PORT, 3000);

/**
 * 微信小程序页面收录规则（sitemap.json）
 * --------------------------------------------------------------------------
 * 作用：声明哪些页面允许被「微信搜一搜」的爬虫索引。
 *
 * 官方规则要点（developers.weixin.qq.com/miniprogram/dev/reference/configuration/sitemap.html）：
 *  1. page 字段的 "*" 表示「所有页面」，**不能当通配符用** ——
 *     写不出 `pages/detail/*` 这种前缀匹配，所以不允许收录的页面必须逐条列出。
 *  2. priority 值越大规则越早被匹配；不带 priority 时按数组从上到下匹配。
 *  3. params 声明该页面收录时用到的参数「名称」（不含值），matching=inclusive 表示
 *     「只要包含这些参数就命中」，用于给带参数的页面（详情页 ?id=、专题页 ?category=）
 *     做更精确的显式声明，官方例子里这类规则会被「优先索引」。
 *  4. 官方硬性要求：「若小程序爬虫发现的页面数据和真实用户的呈现不一致，
 *     那么该页面将不会进入索引中」—— 因此 /api/materials 等接口必须保持免登录公开
 *     （当前 materials.controller 已无任何 guard，爬虫无需身份即可取到与用户相同的数据）。
 *
 * 爬虫标识：user-agent 为 mpcrawler、场景值 1129；会在请求头带
 * X-WXApp-Crawler-Timestamp / -Nonce / -Signature 三个字段，可用于在接口侧识别爬虫。
 */
const WEAPP_SITEMAP = {
  desc: '微信搜一搜页面收录规则：内容页全部开放索引并区分优先级，仅排除管理后台与个人中心页面。',
  rules: [
    // ---- 1) 先屏蔽：管理后台不含用户可搜索的内容，且暴露后台入口有安全风险 ----
    { action: 'disallow', page: 'pages/admin/index', priority: 1.0 },
    { action: 'disallow', page: 'pages/admin-categories/index', priority: 1.0 },
    { action: 'disallow', page: 'pages/admin-pictures/index', priority: 1.0 },
    { action: 'disallow', page: 'pages/admin-crawl/index', priority: 1.0 },
    { action: 'disallow', page: 'pages/admin-config/index', priority: 1.0 },
    // ---- 2) 个人中心类页面：内容随用户变化，爬虫抓到的是空页，收录反而拉低质量度 ----
    { action: 'disallow', page: 'pages/my-likes/index', priority: 1.0 },
    { action: 'disallow', page: 'pages/my-downloads/index', priority: 1.0 },
    // ---- 3) 核心内容页：显式声明 + 提权，引导爬虫把抓取配额优先分给这些页面 ----
    { action: 'allow', page: 'pages/index/index', priority: 0.9 },
    {
      action: 'allow',
      page: 'pages/detail/index',
      params: ['id'],
      matching: 'inclusive',
      priority: 0.8,
    },
    { action: 'allow', page: 'pages/avatar/index', priority: 0.7 },
    { action: 'allow', page: 'pages/wallpaper/index', priority: 0.7 },
    {
      action: 'allow',
      page: 'pages/topic/index',
      params: ['category'],
      matching: 'inclusive',
      priority: 0.6,
    },
    { action: 'allow', page: 'pages/faq/index', priority: 0.5 },
    // ---- 4) 兜底规则：其余页面（如「我的」）仍允许被索引 ----
    // 官方默认行为就是「未显式 disallow 的一律允许」，这里显式写出以免日后误伤
    { action: 'allow', page: '*' },
  ],
};

/** 把 sitemap.json 写入小程序产物根目录（与 app.json 同级，微信才能读到） */
const generateWeappSitemap = (outputRoot: string) => {
  const outputDir = path.resolve(__dirname, '..', outputRoot);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(
    path.resolve(outputDir, 'sitemap.json'),
    JSON.stringify(WEAPP_SITEMAP, null, 2),
  );
};

const generateTTProjectConfig = (outputRoot: string) => {
  const config = {
    miniprogramRoot: './',
    projectname: 'coze-mini-program',
    appid: process.env.TARO_APP_TT_APPID || '',
    setting: {
      urlCheck: false,
      es6: false,
      postcss: false,
      minified: false,
    },
  };
  const outputDir = path.resolve(__dirname, '..', outputRoot);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(
    path.resolve(outputDir, 'project.config.json'),
    JSON.stringify(config, null, 2),
  );
};

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'vite'>(async (merge, _env) => {
  const outputRootMap: Record<string, string> = {
    weapp: 'dist',
    tt: 'dist-tt',
    h5: 'dist-web',
  };
  const defaultOutputRoot = outputRootMap[process.env.TARO_ENV || ''] || 'dist';
  const outputRoot = process.env.OUTPUT_ROOT?.trim() || defaultOutputRoot;
  const isH5 = process.env.TARO_ENV === 'h5';

  const buildMiniCIPluginConfig = () => {
    const hasWeappConfig = !!process.env.TARO_APP_WEAPP_APPID;
    const hasTTConfig = !!process.env.TARO_APP_TT_EMAIL;
    if (!hasWeappConfig && !hasTTConfig) {
      return [];
    }
    const miniCIConfig: Record<string, any> = {
      version: pkg.version,
      desc: pkg.description,
    };
    if (hasWeappConfig) {
      miniCIConfig.weapp = {
        appid: process.env.TARO_APP_WEAPP_APPID,
        privateKeyPath: 'key/private.appid.key',
      };
    }
    if (hasTTConfig) {
      miniCIConfig.tt = {
        email: process.env.TARO_APP_TT_EMAIL,
        password: process.env.TARO_APP_TT_PASSWORD,
        setting: {
          skipDomainCheck: true,
        },
      };
    }
    return [['@tarojs/plugin-mini-ci', miniCIConfig]] as PluginItem[];
  };

  const baseConfig: UserConfigExport<'vite'> = {
    projectName: 'coze-mini-program',
    date: '2026-1-13',
    alias: {
      '@': path.resolve(__dirname, '..', 'src'),
    },
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    outputRoot,
    plugins: ['@tarojs/plugin-generator', ...buildMiniCIPluginConfig()],
    defineConstants: {
      PROJECT_DOMAIN: JSON.stringify(
        process.env.PROJECT_DOMAIN ||
          process.env.COZE_PROJECT_DOMAIN_DEFAULT ||
          '',
      ),
      TARO_ENV: JSON.stringify(process.env.TARO_ENV),
    },
    copy: {
      patterns: [],
      options: {},
    },
    ...(process.env.TARO_ENV === 'tt' && {
      tt: {
        appid: process.env.TARO_APP_TT_APPID,
        projectName: 'coze-mini-program',
      },
    }),
    jsMinimizer: 'esbuild',
    framework: 'react',
    compiler: {
      type: 'vite',
      vitePlugins: [
        {
          name: 'postcss-config-loader-plugin',
          config(config) {
            // 通过 postcss 配置注册 tailwindcss 插件
            if (typeof config.css?.postcss === 'object') {
              config.css?.postcss.plugins?.unshift(tailwindcss());
            }
          },
        },
        {
          name: 'hmr-config-plugin',
          config() {
            if (!process.env.PROJECT_DOMAIN) {
              return;
            }
            return {
              server: {
                hmr: {
                  overlay: true,
                  path: '/hot/vite-hmr',
                  port: 6000,
                  clientPort: 443,
                  timeout: 30000,
                },
              },
            };
          },
        },
        ...(isH5
          ? []
          : [
              UnifiedViteWeappTailwindcssPlugin({
                rem2rpx: true,
                cssEntries: [path.resolve(__dirname, '../src/app.css')],
              }),
            ]),
        ...(process.env.TARO_ENV === 'tt'
          ? [
              {
                name: 'generate-tt-project-config',
                closeBundle() {
                  generateTTProjectConfig(outputRoot);
                },
              },
            ]
          : []),
        ...(process.env.TARO_ENV === 'weapp'
          ? [
              {
                name: 'generate-weapp-sitemap',
                closeBundle() {
                  generateWeappSitemap(outputRoot);
                },
              },
            ]
          : []),
      ],
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
    },
    h5: {
      publicPath: './',
      staticDirectory: 'static',
      router: {
        mode: 'hash',
      },
      devServer: {
        port: h5Port,
        host: '0.0.0.0',
        open: false,
        proxy: {
          '/api': {
            target: `http://localhost:${serverPort}`,
            changeOrigin: true,
          },
          // 后端本地物理存储的素材图片（server/public → /static）
          '/static': {
            target: `http://localhost:${serverPort}`,
            changeOrigin: true,
          },
        },
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css',
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        pxtransform: {
          enable: true,
          config: {
            platform: 'h5',
          },
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
    },
    rn: {
      appName: 'coze-mini-program',
      postcss: {
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
        },
      },
    },
  };

  process.env.BROWSERSLIST_ENV = process.env.NODE_ENV;

  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig);
  }
  // 生产构建配置（默认开启压缩混淆等）
  return merge({}, baseConfig, prodConfig);
});
