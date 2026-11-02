/**
 * 将 esbuild 产出的 CJS 包体包装为 DSH 客户端模块注册脚本。
 *
 * DSH 的客户端模块系统约定：每个插件 bundle 是一个脚本，执行时调用
 * `window.__ModuleLoader__.load({ id, factory })` 注册工厂；工厂在首次使用时才执行，
 * 通过参数 `require` 解析外部模块（react 等），返回插件的导出对象（含 inject/apply）。
 *
 * 用法：node scripts/wrap.mjs <输入CJS文件> <输出client.js> <模块id>
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const [, , input, output, idArg] = process.argv
if (!input || !output) {
  console.error('用法：node scripts/wrap.mjs <输入CJS文件> <输出client.js> [模块id]')
  process.exit(1)
}

const moduleId = idArg || 'dsh-project-report'
const bundled = await readFile(resolve(input), 'utf8')

const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(moduleId)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${bundled}
    return module.exports;
  },
});
`

await mkdir(dirname(resolve(output)), { recursive: true })
await writeFile(resolve(output), wrapped, 'utf8')
console.log(`已生成 ${resolve(output)}（${wrapped.length} 字节）`)
