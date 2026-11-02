/**
 * 与宿主通信的 RPC 封装。
 *
 * 浏览器侧通过 DSH Connection 的 unary RPC 调用宿主注册的 `/api/project-report` 路由。
 * 宿主返回 { ok, value } 或 { ok:false, error }；此处统一解包并抛出可读错误。
 */

/** 端点名（与宿主 lib/index.js 中的 ENDPOINT 保持一致）。 */
const ENDPOINT = 'project-report'

/**
 * 创建 API 调用器。
 * @param {any} connection DSH 客户端 connection 服务
 * @returns {(method:string, payload?:any, signal?:AbortSignal)=>Promise<any>}
 */
export function createApi(connection) {
  return async function call(method, payload, signal) {
    if (!connection || typeof connection.rpc?.call !== 'function') {
      throw new Error('DSH 连接服务不可用，无法访问项目汇报接口')
    }
    // 约定：第一个参数是通道（/api），第二个是端点名，第三个是 { method, payload }
    // 注意：payload 为 undefined 时 JSON.stringify 会省略该键，导致宿主信封校验失败；
    // 因此这里统一兜底为空对象，保证每次请求都带 payload 字段。
    const rpcPayload = { method, payload: payload === undefined ? {} : payload }
    const result = await connection.rpc.call('/api', ENDPOINT, rpcPayload, signal)
    if (!result || result.ok === false) {
      const message = result?.error?.message || '项目汇报接口调用失败'
      const err = new Error(message)
      err.code = result?.error?.code
      throw err
    }
    return result.value
  }
}
