#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- 独立构建脚本，不参与 TS 工程 */
/**
 * 收尾兜底：确保微信小程序产物根目录里存在 sitemap.json。
 *
 * 为什么需要它？
 * ---------------------------------------------------------------------------
 * Taro 构建**不会**把 sitemap.json 放进产物目录（`@tarojs/vite-runner` 里没有任何
 * sitemap 逻辑），必须靠 config/index.ts 的 `copy.patterns` 拷贝。
 * 而 miniprogram-ci 的上传侧（common/code-analyse）是这么找 sitemap 的：
 *
 *   appJson.sitemapLocation
 *     ? addDep(sitemapLocation, miniprogramRoot)          // ← 无条件，不检查存在性
 *     : fileHelper.existFile('sitemap.json') && addDep('sitemap.json')
 *
 * 因为 app.config.ts 里声明了 `sitemapLocation: 'sitemap.json'`，只要产物里没有这个文件，
 * 上传时带上去的就是一份空内容，服务端直接报：
 *
 *   -80055 Invalid SiteMap, sitemap错误，非法Json格式
 *
 * 整个小程序上传随之失败，而报错信息完全指不到「文件缺失」这个真实原因。
 * 本脚本在 `taro build` 退出后立即校验并（必要时）补写，属于确定性兜底：
 * 它跑完之后不会再有任何步骤清空产物目录。
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceFile = path.join(root, 'src', 'sitemap.json');
const outputRoot = (process.env.OUTPUT_ROOT || 'dist').trim() || 'dist';
const outputDir = path.resolve(root, outputRoot);
const targetFile = path.join(outputDir, 'sitemap.json');

function fail(message) {
  console.error(`❌ [sitemap] ${message}`);
  console.error('   产物里缺少 sitemap.json 会导致小程序上传直接失败（-80055 Invalid SiteMap）。');
  process.exit(1);
}

if (!fs.existsSync(sourceFile)) {
  fail(`规则源文件不存在：${path.relative(root, sourceFile)}`);
}

const source = fs.readFileSync(sourceFile, 'utf8');

let parsed;
try {
  parsed = JSON.parse(source);
} catch (error) {
  fail(`规则源文件不是合法 JSON：${error.message}`);
}
if (!parsed || !Array.isArray(parsed.rules) || parsed.rules.length === 0) {
  fail(`规则源文件缺少非空 rules 数组：${path.relative(root, sourceFile)}`);
}

const outputDirExisted = fs.existsSync(outputDir);
if (!outputDirExisted) {
  console.warn(`⚠️  [sitemap] 产物目录原本不存在，已创建：${outputRoot}/`);
  fs.mkdirSync(outputDir, { recursive: true });
}

let action = '已存在且一致，跳过';
if (!fs.existsSync(targetFile)) {
  action = '产物中缺失 → 已补写';
} else if (fs.readFileSync(targetFile, 'utf8') !== source) {
  action = '与源文件不一致 → 已覆盖';
}

if (action !== '已存在且一致，跳过') {
  fs.writeFileSync(targetFile, source);
}

const bytes = Buffer.byteLength(source, 'utf8');
console.log(
  `✅ [sitemap] ${outputRoot}/sitemap.json ${action}（${bytes} bytes，rules=${parsed.rules.length}）`,
);
