/** Typed access to the gateway API. */

/** Signed-in account as the platform renders it. */
export interface PlatformUser {
  id: string
  name: string
  username: string
}

/** Lifecycle of a project's Host process. */
export type ProjectStatus = 'failed' | 'idle' | 'running' | 'starting'

/** One project: a directory with its own dedicated Host process. */
export interface DshProject {
  dir: string
  id: string
  lastStartedAt: string | null
  name: string
  ownerUid: string
  port: number
  status: ProjectStatus
  statusDetail: string | null
}

/** Failure the gateway reported, carrying the status the shell branches on. */
export class ApiError extends Error {
  readonly status: number

  /**
   * @param message - diagnostic text from the gateway.
   * @param status - HTTP status code.
   */
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Perform one request and unwrap the `data` envelope.
 * @param path - gateway path.
 * @param init - fetch options; the session cookie is always sent.
 * @returns the unwrapped payload.
 */
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
  const body: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : `请求失败（${response.status}）`
    throw new ApiError(message, response.status)
  }
  return (body as { data: T }).data
}

export const authApi = {
  /** URL of a freshly issued captcha image. */
  captchaUrl: (): string => `/api/auth/captcha?t=${Date.now()}`,

  /**
   * @param input - account name, password, and the drawn code.
   * @returns the signed-in account with its bearer token.
   */
  login: (input: { captcha: string; password: string; username: string }) =>
    call<{ token: string; user: PlatformUser }>('/api/auth/login', {
      body: JSON.stringify(input),
      method: 'POST',
    }),

  /** @returns the signed-in account, or throws 401 when there is no session. */
  me: () => call<PlatformUser>('/api/auth/me'),

  /** @returns nothing; the session cookie is cleared. */
  logout: () => call<null>('/api/auth/logout', { method: 'POST' }),
}

export const projectsApi = {
  /** @returns every project the caller owns. */
  list: () => call<DshProject[]>('/api/dsh/projects'),

  /**
   * @param input - display name and absolute directory.
   * @returns the created project.
   */
  create: (input: { dir: string; name: string }) =>
    call<DshProject>('/api/dsh/projects', { body: JSON.stringify(input), method: 'POST' }),

  /**
   * @param id - project id.
   * @returns nothing; the project's Host stops with it.
   */
  remove: (id: string) => call<{ removed: boolean }>(`/api/dsh/projects/${id}`, { method: 'DELETE' }),
}
