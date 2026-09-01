#!/usr/bin/env node
/**
 * dsh-read-image-preview-xg 构建脚本（跨平台 Node，无外部依赖）。
 *
 * 步骤：
 *   0. 补齐 node_modules junction（指向 DSH checkout，仅供 tsc 类型检查；
 *      运行时的真实依赖由 DSH profile 的 node_modules 提供）
 *   1. tsdown 打包客户端 → lib/client.js（单文件 ModuleLoader bundle，
 *      先跑：其 clean 会清空 lib/）
 *   2. tsc 编译宿主 src → lib/（ESM，宿主端 + 类型声明）
 *   3. tsc --noEmit 客户端类型检查
 *   4. 验证：宿主 import（name/apply）、客户端 bundle 头部 wrapper
 *   5. 单元测试（node --test）
 *
 * 用法：node scripts/build.mjs
 * 环境变量：DSH_CHECKOUT 指定 DSH checkout 根目录（默认 D:/deepseek-harness）
 */

import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readdirSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const checkout = process.env.DSH_CHECKOUT ?? 'D:/deepseek-harness'
const nm = join(root, 'node_modules')
const scoped = join(nm, '@deepseek-ai')

function ensureJunction(link, target) {
  if (!existsSync(target)) throw new Error(`junction 目标缺失: ${target}`)
  const st = lstatSync(link, { throwIfNoEntry: false })
  if (st !== undefined) return // 已存在（junction 或真实目录），不覆盖
  mkdirSync(join(link, '..'), { recursive: true })
  symlinkSync(target, link, 'junction')
  console.log(`junction: ${link} -> ${target}`)
}

// 0. junctions（类型检查用；客户端 tsx 依赖 react 类型）
ensureJunction(join(nm, 'typescript'), join(checkout, 'node_modules', 'typescript'))
ensureJunction(join(nm, '@types', 'node'), join(checkout, 'node_modules', '@types', 'node'))
ensureJunction(join(nm, 'react'), join(checkout, 'packages', 'client', 'ui-primitives', 'node_modules', 'react'))
const pnpmDir = join(checkout, 'node_modules', '.pnpm')
const reactTypesEntry = readdirSync(pnpmDir)
  .filter(d => d.startsWith('@types+react@') && !d.includes('dom'))
  .sort()
  .at(-1)
if (reactTypesEntry === undefined) throw new Error(`checkout 的 .pnpm 中找不到 @types/react: ${pnpmDir}`)
ensureJunction(join(nm, '@types', 'react'), join(pnpmDir, reactTypesEntry, 'node_modules', '@types', 'react'))

const node = process.execPath
const tsdownCli = join(checkout, 'node_modules', 'tsdown', 'dist', 'run.mjs')
const tsc = join(checkout, 'node_modules', 'typescript', 'bin', 'tsc')

function run(step, cmd, args) {
  console.log(`\n=== ${step} ===`)
  execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })
}

// 1. 客户端 bundle（先跑，clean lib/）
run('1/5 client: tsdown bundle', node, [tsdownCli, '--config', 'tsdown.config.ts'])

// 2. 宿主端 tsc
run('2/5 host: tsc', node, [tsc, '-p', 'tsconfig.json'])

// 3. 客户端类型检查
run('3/5 client: tsc --noEmit', node, [tsc, '-p', 'tsconfig.client.json'])

// 4. 验证
console.log('\n=== 4/5 verify ===')
const hostCheck = execFileSync(
  node,
  ['-e', `import('./lib/index.js').then(m => { console.log('host ok: name=' + m.name + ' apply=' + typeof m.apply); })`],
  { cwd: root, encoding: 'utf8' },
)
console.log(hostCheck.trim())
const { readFileSync } = await import('node:fs')
const bundle = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
if (!bundle.trimStart().startsWith('window.__ModuleLoader__.load(')) {
  throw new Error('client bundle 头部缺少 ModuleLoader wrapper')
}
if (!bundle.includes('id: "dsh-read-image-preview-xg"')) {
  throw new Error('client bundle 缺少插件 id')
}
if (!bundle.includes('tool.call.toolview') || !bundle.includes('read_image')) {
  throw new Error('client bundle 内容异常（缺少槽注册或工具名）')
}
if (!bundle.includes('useLoadImage') || !bundle.includes('uiConversation')) {
  throw new Error('client bundle 内容异常（缺少取图钩子或服务通路）')
}
if (!/return module\.exports;\s*\}\s*\}\);?\s*$/.test(bundle)) {
  throw new Error('client bundle 尾部缺少 ModuleLoader wrapper 收尾')
}
console.log(`client ok: lib/client.js ${bundle.length} chars`)
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
// client-modules registry 用 require.resolve('<pkg>/package.json') 发现客户端半：
// exports 映射必须暴露 ./client 与 ./package.json 两个子路径，否则包被静默判为无客户端。
if (pkg.exports['./client'] === undefined) throw new Error('package.json exports 缺少 "./client"')
if (pkg.exports['./package.json'] === undefined) throw new Error('package.json exports 缺少 "./package.json"')
if (pkg.dsh?.client?.platform !== 'web') throw new Error('package.json dsh.client.platform 应为 web')
console.log('package.json ok: exports ./client + ./package.json, dsh.client web')

// 5. 单元测试
run('5/5 tests: node --test', node, ['--test', 'tests/logic.spec.mjs'])

console.log('\nbuild 完成：lib/ 就绪（宿主 ESM + client.js bundle + 类型声明）')
