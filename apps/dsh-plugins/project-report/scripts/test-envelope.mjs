/**
 * 信封兼容性回归测试：模拟客户端 payload 为 undefined 时被 JSON 省略的情况
 * （即 message.payload = { method: 'meta' }，没有 payload 键），验证宿主仍能接受。
 * 用法：node scripts/test-envelope.mjs
 */
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const mod = await import(pathToFileURL(resolve('lib/index.js')).href)
const regs = []
const ctx = {
  logger: () => ({ info() {}, warn() {}, error() {} }),
  effect(fn) { fn() },
  connection: { fetch: { register(def) { regs.push(def); return () => {} } } },
}
await mod.apply(ctx, { projectRoot: 'D:\\code\\kh-app' })
const route = regs[0]

/**
 * 直接发送原始信封。
 * @param {any} bodyObj 请求体
 * @returns {Promise<any>} 响应 JSON
 */
async function raw(bodyObj) {
  const req = new Request('http://127.0.0.1/api/project-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(bodyObj),
  })
  const res = await route.fetch(req)
  return res.json()
}

const r1 = await raw({ type: 'client-request', rpcId: 'a', method: 'project-report', payload: { method: 'meta' } })
console.log('no-payload-key meta ok =', r1.result?.ok, JSON.stringify(r1.result?.value || r1.result?.error))
if (r1.result?.ok !== true) throw new Error('缺少 payload 字段时仍应被接受')

const r2 = await raw({ type: 'client-request', rpcId: 'b', method: 'project-report', payload: { method: 'projects' } })
console.log('no-payload-key projects ok =', r2.result?.ok, 'count =', r2.result?.value?.projects?.length)
if (r2.result?.ok !== true) throw new Error('projects 无 payload 时应被接受')

console.log('\n✅ 信封兼容测试通过')
