import http from 'node:http'
import net from 'node:net'

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'

import { Injectable, Logger } from '@nestjs/common'

import { AuthService, SESSION_COOKIE, type SessionUser } from '../auth/auth.service.js'
import { readCookie } from '../common/cookies.js'
import { DshHostService, type RunningHost } from './dsh-host.service.js'
import { ProjectsService } from '../projects/projects.service.js'

/** Headers that only describe one TCP hop and must not cross the proxy. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/**
 * Forwards browser traffic for /p/<id>/ to that project's Host.
 *
 * The browser-side Host header is preserved: the Host binds its session cookie
 * to that authority and fences unlisted values, so rewriting it would invalidate
 * every session. The mount prefix is stripped instead, and the Host's own auth
 * cookie path is rewritten to stay inside the mount. Requests must carry a
 * gateway session whose user owns the project; the Host's own fence alone would
 * let any signed-in browser reach any project.
 */
@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name)

  /**
   * @param projects - project registry, used to resolve the mount to a project.
   * @param hosts - Host supervisor that starts a project's Host on demand.
   * @param auth - session verifier, so a mount only serves its owner.
   */
  constructor(
    private readonly projects: ProjectsService,
    private readonly hosts: DshHostService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Handle one HTTP request mounted at /p.
   * @param request - browser request, with /p already stripped from its url.
   * @param response - browser response.
   */
  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const user = this.auth.verify(readCookie(request, SESSION_COOKIE))
    if (user === undefined) {
      this.fail(response, 401, '未登录网关')
      return
    }
    const resolved = await this.resolve(request.url ?? '', user)
    if (resolved === undefined) {
      this.fail(response, 404, '项目不存在')
      return
    }
    const { id, rest, host } = resolved
    if (host === undefined) {
      this.fail(response, 502, '项目 Host 未能启动')
      return
    }

    const mount = '/p/' + id
    if (!rest.startsWith('/')) {
      response.writeHead(308, { location: mount + '/' + rest })
      response.end()
      return
    }

    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: host.port,
        method: request.method,
        path: rest,
        headers: this.forwardableHeaders(request.headers),
      },
      (upstreamResponse) => {
        const status = upstreamResponse.statusCode ?? 502
        if (this.needsSessionHandshake(request, rest, status)) {
          upstreamResponse.resume()
          response.writeHead(302, {
            location: mount + rest + (rest.includes('?') ? '&' : '?') + 'token=' + host.token,
            'cache-control': 'no-store',
          })
          response.end()
          return
        }

        const headers: Record<string, string | string[]> = {}
        for (const [name, value] of Object.entries(upstreamResponse.headers)) {
          if (value !== undefined) headers[name] = value
        }
        const cookies = upstreamResponse.headers['set-cookie']
        if (cookies !== undefined) {
          headers['set-cookie'] = cookies.map(cookie => cookie.replace(/Path=\/(?=;|$)/i, 'Path=' + mount + '/'))
        }
        response.writeHead(status, headers)
        upstreamResponse.pipe(response)
      },
    )
    upstream.on('error', (error: NodeJS.ErrnoException) => {
      this.logger.warn('转发失败 ' + id + ': ' + error.message)
      this.fail(response, 502, 'dsh Host 无响应 (' + (error.code ?? error.message) + ')')
    })
    request.pipe(upstream)
  }

  /**
   * Tunnel one WebSocket upgrade to its project's Host.
   * @param request - browser upgrade request, whose url still carries /p/<id>.
   * @param socket - browser socket.
  /**
   * Forward one origin-root plugin API request (`/api/dsh-ssh/...`) to the Host
   * of the project whose workspace page made it.
   *
   * Plugin clients build their routes against the origin root, so a page mounted
   * at `/p/<id>/` cannot reach them through the mount. The Referer names that
   * mount; without it the request cannot be attributed to a project and is
   * refused rather than guessed at.
   * @param request - browser request, whose url still carries the root path.
   * @param response - browser response.
   * @returns a promise that settles once the request is forwarded or refused.
   */
  async handleRootApi(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const user = this.auth.verify(readCookie(request, SESSION_COOKIE))
    if (user === undefined) {
      this.fail(response, 401, '未登录网关')
      return
    }
    const id = projectIdFromReferer(request.headers.referer)
    if (id === undefined) {
      this.fail(response, 400, '缺少 Referer，无法确定项目')
      return
    }
    const project = await this.projects.find(id)
    if (project === undefined || project.ownerUid !== user.uid) {
      this.fail(response, 404, '项目不存在')
      return
    }
    let host: RunningHost
    try {
      host = await this.hosts.ensure(project)
    } catch (error) {
      this.logger.warn('启动失败 ' + id + ': ' + String(error))
      this.fail(response, 502, '项目 Host 未能启动')
      return
    }

    const headers = this.forwardableHeaders(request.headers)
    // A plugin's root-path API verifies the loopback origin of its own port, so the browser's Host and
    // Origin are rewritten to the Host process it actually reaches.
    headers.host = '127.0.0.1:' + host.port
    if (headers.origin !== undefined) headers.origin = 'http://127.0.0.1:' + host.port

    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: host.port,
        method: request.method,
        path: request.url ?? '/',
        headers,
      },
      (upstreamResponse) => {
        const headers: Record<string, string | string[]> = {}
        for (const [name, value] of Object.entries(upstreamResponse.headers)) {
          if (value !== undefined) headers[name] = value
        }
        response.writeHead(upstreamResponse.statusCode ?? 502, headers)
        upstreamResponse.pipe(response)
      },
    )
    upstream.on('error', (error: NodeJS.ErrnoException) => {
      this.logger.warn('转发失败 ' + id + ': ' + error.message)
      this.fail(response, 502, 'dsh Host 无响应 (' + (error.code ?? error.message) + ')')
    })
    request.pipe(upstream)
  }

  /**
   * Tunnel one WebSocket upgrade to the Host of its project.
   * @param request - browser upgrade request, whose url still carries /p/<id>.
   * @param socket - browser socket.
   * @param head - bytes read past the handshake.
   */
  async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const url = request.url ?? ''
    const match = /^\/p\/([^/?#]+)(.*)$/.exec(url)
    if (match === null) {
      socket.destroy()
      return
    }
    const user = this.auth.verify(readCookie(request, SESSION_COOKIE))
    if (user === undefined) {
      socket.destroy()
      return
    }
    const id = match[1] as string
    const rest = match[2] === '' ? '/' : (match[2] as string)
    const project = await this.projects.find(id)
    if (project === undefined || project.ownerUid !== user.uid) {
      socket.destroy()
      return
    }
    let host: RunningHost
    try {
      host = await this.hosts.ensure(project)
    } catch (error) {
      this.logger.warn('升级失败 ' + id + ': ' + String(error))
      socket.destroy()
      return
    }

    const upstream = net.connect(host.port, '127.0.0.1', () => {
      const lines = [String(request.method) + ' ' + rest + ' HTTP/1.1']
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        lines.push(request.rawHeaders[index] + ': ' + request.rawHeaders[index + 1])
      }
      upstream.write(lines.join('\r\n') + '\r\n\r\n')
      if (head.length > 0) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    const destroy = () => {
      socket.destroy()
      upstream.destroy()
    }
    upstream.on('error', destroy)
    socket.on('error', destroy)
    socket.on('close', destroy)
  }

  private async resolve(
    relative: string,
    user: SessionUser,
  ): Promise<{ host: RunningHost | undefined; id: string; rest: string } | undefined> {
    const match = /^\/([^/?#]+)(.*)$/.exec(relative)
    if (match === null) return undefined
    const id = match[1] as string
    const project = await this.projects.find(id)
    if (project === undefined || project.ownerUid !== user.uid) return undefined
    try {
      return { host: await this.hosts.ensure(project), id, rest: match[2] as string }
    } catch (error) {
      this.logger.warn('启动失败 ' + id + ': ' + String(error))
      return { host: undefined, id, rest: match[2] as string }
    }
  }

  private needsSessionHandshake(request: IncomingMessage, rest: string, status: number): boolean {
    if (status !== 401 || request.method !== 'GET') return false
    if (rest.includes('token=')) return false
    const navigational =
      request.headers['sec-fetch-mode'] === 'navigate' || String(request.headers.accept ?? '').includes('text/html')
    return navigational
  }

  private forwardableHeaders(headers: IncomingMessage['headers']): Record<string, string | string[]> {
    const out: Record<string, string | string[]> = {}
    for (const [name, value] of Object.entries(headers)) {
      if (value === undefined || HOP_BY_HOP.has(name)) continue
      out[name] = value
    }
    return out
  }

  private fail(response: ServerResponse, status: number, message: string): void {
    if (response.headersSent) {
      response.end()
      return
    }
    response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(message)
  }
}

/**
 * The project id named by a workspace page mount, read from its Referer.
 * @param referer - the `Referer` request header, when the browser sent one.
 * @returns the project id, or undefined when the value carries no mount.
 */
function projectIdFromReferer(referer: string | undefined): string | undefined {
  if (referer === undefined) return undefined
  let pathname: string
  try {
    pathname = new URL(referer).pathname
  } catch {
    return undefined
  }
  const match = /^\/p\/([^/?#]+)/.exec(pathname)
  return match === null ? undefined : match[1]
}
