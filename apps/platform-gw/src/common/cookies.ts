import type { IncomingMessage } from 'node:http'

/**
 * Read one cookie from a raw Cookie header.
 * @param header - the request's cookie header, if any.
 * @param name - cookie name.
 * @returns the cookie value, or undefined when absent.
 */
export function cookieFromHeader(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim())
  }
  return undefined
}

/**
 * Read one cookie from the browser's request.
 * @param request - inbound HTTP or Express request.
 * @param name - cookie name.
 * @returns the cookie value, or undefined when absent.
 */
export function readCookie(request: IncomingMessage, name: string): string | undefined {
  return cookieFromHeader(request.headers.cookie, name)
}

/**
 * Build a Set-Cookie value for a same-site session cookie.
 * @param name - cookie name.
 * @param value - cookie value.
 * @param maxAgeSeconds - lifetime in seconds; 0 deletes the cookie.
 * @returns the header value.
 */
export function sessionCookie(name: string, value: string, maxAgeSeconds: number): string {
  return [name + '=' + encodeURIComponent(value), 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + maxAgeSeconds].join('; ')
}
