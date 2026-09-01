import type { UserConfig } from 'tsdown'

const id = 'dsh-read-image-preview-xg'

/**
 * 客户端 bundle：单文件 CJS，由 window.__ModuleLoader__.load 装载
 * （factory 内的 require 走 shell 注入的模块表）。
 *
 * - react / react-jsx-runtime 为 external（浏览器侧由平台模块表解析，不打进包）
 * - 输出 lib/client.js；宿主 tsc 产物也在 lib/ 下，因此 tsdown 必须先于 tsc 运行
 *   （其 clean 会清掉整个 lib/），构建脚本已按此排序
 * - 纯浏览器代码：不 import 任何 Node 内建或宿主包（purity 约束），
 *   类型一律为本地结构子集（type-only import 会被擦除）
 */
export default {
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  clean: true,
  dts: false,
  deps: {
    neverBundle: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
} satisfies UserConfig
