/**
 * 客户端 bundle 装配自测：在 Node 中用最小桩环境执行 lib/client.js，
 * 验证：
 * 1. 通过 window.__ModuleLoader__.load 注册了工厂；
 * 2. 工厂返回 { inject, apply }；
 * 3. apply 正确向 sidebar.panellist 与 main 注册；
 * 4. main 的 inject 提供 call，且 call 走 connection.rpc.call('/api','project-report',...)。
 * 用法：node scripts/test-client.mjs
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const code = await readFile(resolve('lib/client.js'), 'utf8')

/** 捕获加载的工厂。 */
let captured = null
const windowStub = {
  __ModuleLoader__: { load: (h) => { captured = h } },
}

/** 最小 document 桩（样式注入用）。 */
const documentStub = {
  createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
  head: { append() {} },
}

/** 最小 React 桩：仅需 createElement / Fragment（apply 阶段不渲染组件）。 */
const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: Symbol('Fragment'),
}

/**
 * 外部 require 桩：只允许 react。
 * @param {string} id 模块名
 * @returns {any} 模块
 */
function requireStub(id) {
  if (id === 'react') return ReactStub
  throw new Error(`unexpected require: ${id}`)
}

// 执行 bundle（顶层只会调用 __ModuleLoader__.load）
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'require', code)(windowStub, documentStub, requireStub)

if (!captured) throw new Error('bundle 未调用 __ModuleLoader__.load')
console.log('module id =', captured.id)
if (typeof captured.factory !== 'function') throw new Error('factory 不是函数')

const exportsObj = captured.factory(requireStub)
console.log('exports keys =', Object.keys(exportsObj).join(','))
console.log('inject =', JSON.stringify(exportsObj.inject))

/** 记录 slot 注册。 */
const slotRegs = []
/** 记录 RPC 调用。 */
const rpcCalls = []

const ctx = {
  effect(fn) { fn() },
  connection: {
    rpc: {
      async call(channel, endpoint, payload) {
        rpcCalls.push({ channel, endpoint, payload })
        return { ok: true, value: { projects: [], rows: [], total: 0 } }
      },
    },
  },
  slots: {
    inject(name, cb) { cb() },
    register(def, component) {
      slotRegs.push({ def, component })
      return () => {}
    },
  },
}

exportsObj.apply(ctx)

console.log('slot registrations =', slotRegs.map((r) => r.def.name + (r.def.id ? `#${r.def.id}` : r.def.key ? `#${r.def.key}` : '')).join(', '))

const sidebar = slotRegs.find((r) => r.def.name === 'sidebar.panellist')
const main = slotRegs.find((r) => r.def.name === 'main')
if (!sidebar) throw new Error('缺少 sidebar.panellist 注册')
if (!main) throw new Error('缺少 main 注册')
if (sidebar.def.id !== main.def.key) throw new Error('侧栏 id 与 main key 不一致（点击无法切换面板）')
if (typeof sidebar.def.label !== 'function' && typeof sidebar.def.label !== 'string') throw new Error('侧栏缺少 label')

const injected = main.def.inject()
if (typeof injected.call !== 'function') throw new Error('main 未注入 call')

// 验证 call 走正确的 RPC 目标
await injected.call('projects', {})
const last = rpcCalls[rpcCalls.length - 1]
console.log('rpc target =', last.channel, last.endpoint, JSON.stringify(last.payload))
if (last.channel !== '/api' || last.endpoint !== 'project-report') throw new Error('RPC 目标不正确')
if (last.payload?.method !== 'projects') throw new Error('RPC method 不正确')

// 关键回归：无 payload 的调用（如 meta）必须自动补空对象，否则宿主信封校验会失败
await injected.call('meta')
const metaCall = rpcCalls[rpcCalls.length - 1]
console.log('rpc(meta) payload =', JSON.stringify(metaCall.payload))
if (metaCall.payload?.method !== 'meta') throw new Error('meta RPC method 不正确')
if (!metaCall.payload.payload || typeof metaCall.payload.payload !== 'object') {
  throw new Error('无 payload 调用未补空对象')
}

console.log('\n✅ 客户端 bundle 装配自测通过')
