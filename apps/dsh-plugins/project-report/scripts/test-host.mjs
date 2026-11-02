/**
 * 宿主插件端到端自测：在 Node 中加载 lib/index.js，用假 ctx 捕获 RPC 路由注册，
 * 再用伪造的 Request 调用路由，验证 meta / projects / daily.list / weekly.list 真实返回。
 * 用法：node scripts/test-host.mjs
 */
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const indexPath = pathToFileURL(resolve('lib/index.js')).href
const mod = await import(indexPath)

console.log('plugin name =', mod.name, '| inject =', JSON.stringify(mod.inject))

/** 捕获注册的路由定义。 */
const registrations = []

/** 构造一个最小可用的假 Cordis 上下文。 */
const ctx = {
  logger: () => ({
    info: (...a) => console.log('[info]', ...a),
    warn: (...a) => console.warn('[warn]', ...a),
    error: (...a) => console.error('[error]', ...a),
  }),
  effect(fn) {
    const cleanup = fn()
    return () => { if (typeof cleanup === 'function') cleanup() }
  },
  connection: {
    fetch: {
      register(def) {
        registrations.push(def)
        console.log('registered route =', def.path, JSON.stringify(def.methods))
        return () => console.log('route disposed')
      },
    },
  },
}

await mod.apply(ctx, { projectRoot: 'D:\\code\\kh-app' })
const route = registrations[0]
if (!route) throw new Error('未注册任何路由')

/**
 * 以 Connection 约定的 envelope 调用路由。
 * @param {string} method 方法名
 * @param {any} payload 参数
 * @returns {Promise<any>} result 值
 */
async function rpc(method, payload) {
  const body = JSON.stringify({
    type: 'client-request',
    rpcId: 'test-rpc',
    method: 'project-report',
    payload: { method, payload },
  })
  const req = new Request('http://127.0.0.1:3080/api/project-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
  const res = await route.fetch(req)
  const json = await res.json()
  if (json.result?.ok === false) throw new Error(`RPC ${method} 失败：${json.result.error?.message}`)
  return json.result.value
}

const meta = await rpc('meta', {})
console.log('meta =', JSON.stringify(meta))

const projectsRes = await rpc('projects', {})
console.log('projects count =', projectsRes.projects.length)

const pid = process.argv[2] || 'SZ-20260312-040'
const daily = await rpc('daily.list', { projectId: pid, page: 1, pageSize: 5 })
console.log(`daily.list(${pid}) total =`, daily.total, 'pageRows =', daily.rows.length)
console.log('daily sample =', JSON.stringify(daily.rows[0]).slice(0, 220))

const weekly = await rpc('weekly.list', { projectId: pid, page: 1, pageSize: 5 })
console.log(`weekly.list(${pid}) total =`, weekly.total, 'pageRows =', weekly.rows.length)
console.log('weekly sample =', JSON.stringify(weekly.rows[0]).slice(0, 220))

// 全部项目 + 不限日期：应走服务端分页，返回真实 total（日报约 5547、周报约 140）
const allDaily = await rpc('daily.list', { projectId: '', page: 1, pageSize: 10 })
console.log('daily.list(ALL) total =', allDaily.total, 'pageRows =', allDaily.rows.length)
if (!(allDaily.total > 1000) || allDaily.rows.length !== 10) throw new Error('全部项目日报未按服务端分页返回')
const allWeekly = await rpc('weekly.list', { projectId: '', page: 1, pageSize: 10 })
console.log('weekly.list(ALL) total =', allWeekly.total, 'pageRows =', allWeekly.rows.length)

console.log('\n✅ 宿主插件端到端自测通过')
