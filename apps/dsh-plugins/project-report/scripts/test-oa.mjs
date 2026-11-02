/**
 * OA 客户端连通性自测脚本（不依赖 DSH 运行时）。
 * 用法：node scripts/test-oa.mjs
 * 验证：登录、项目列表、按项目的日报/周报查询。
 */
import { createOaClient } from '../lib/oa.js'

const projectRoot = process.env.PROJECT_ROOT || 'D:\\code\\kh-app'

const client = await createOaClient({ projectRoot }, {
  logger: (level, msg) => console.log(`[${level}] ${msg}`),
})

console.log('baseUrl =', client.baseUrl)
console.log('account =', client.account)
console.log('password length =', client.password ? client.password.length : 0)

await client.ensureAuth()
console.log('token length =', client.token.length)
console.log('cookie length =', client.cookie.length)

const projects = await client.listProjects()
console.log('projects count =', projects.length)
console.log('first project =', projects[0])

const pid = process.argv[2] || (projects[0] && projects[0].pro_id)
console.log('---- daily for project', pid, '----')
const daily = await client.listDaily(pid)
console.log('daily rows =', daily.length)
if (daily[0]) console.log('daily sample keys =', Object.keys(daily[0]).join(','))
if (daily[0]) console.log('daily sample =', JSON.stringify(daily[0]).slice(0, 300))

console.log('---- weekly for project', pid, '----')
const weekly = await client.listWeekly(pid)
console.log('weekly rows =', weekly.length)
if (weekly[0]) console.log('weekly sample =', JSON.stringify(weekly[0]).slice(0, 300))
