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
 *
 * ==== 规则文件在哪、怎么进产物（2026-10-09 修复上传失败后定型，勿改回）====
 * 规则唯一来源：仓库里的 **src/sitemap.json**（改收录规则改那个文件，不要改本文件）。
 *
 * ⚠️ 踩坑记录（曾导致线上部署失败）：
 *   1. Taro 构建**不会**把 sitemap.json 放进产物目录（`@tarojs/vite-runner` 源码里完全没有
 *      sitemap 相关逻辑），必须在下面 `copy.patterns` 里显式声明拷贝。只写
 *      `app.config.ts` 的 `sitemapLocation` 是没用的。
 *   2. miniprogram-ci 的上传侧（common/code-analyse）逻辑是：
 *        `appJson.sitemapLocation ? addDep(sitemapLocation, miniprogramRoot)
 *                                 : fileHelper.existFile('sitemap.json') && addDep('sitemap.json')`
 *      也就是说 —— 只要声明了 `sitemapLocation`，它就**无条件**把该路径当依赖文件打包上传
 *      （不像未声明时那样先做存在性检查）。产物里没有这个文件时，上传的就是一份空内容，
 *      服务端直接返回：
 *        `-80055 Invalid SiteMap, sitemap错误，非法Json格式`
 *      整个小程序上传随之失败，且错误信息完全指不到「文件缺失」这个真实原因。
 *   3. 曾经用自写的 vite 插件在 `closeBundle` 里写文件，实际并未产出（上传依旧报错），
 *      所以现在改为「copy 官方机制 + 收尾脚本兜底」双保险：
 *        - 本文件 `copy.patterns`：构建时把 src/sitemap.json 拷到 <产物根>/sitemap.json
 *        - `scripts/ensure-weapp-sitemap.cjs`：build:weapp 退出后校验/补写（确定性最高）
 *      改动这两处中任意一处前，请先确认另一处仍在生效。
 */

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
    // 微信小程序收录规则：Taro 不会自动把 sitemap.json 放进产物目录，必须显式声明拷贝。
    // 规则唯一来源 = src/sitemap.json；`to` 以 outputRoot 开头是 Taro 的约定
    // （其内部按 `^${outputRoot}/` 前缀裁剪后再交给 vite-plugin-static-copy）。
    // 兜底见 scripts/ensure-weapp-sitemap.cjs。
    copy: {
      patterns:
        process.env.TARO_ENV === 'weapp'
          ? [{ from: 'src/sitemap.json', to: `${outputRoot}/sitemap.json` }]
          : [],
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
