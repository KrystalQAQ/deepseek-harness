import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

import { Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { readCookie } from '../common/cookies.js'
import { AuthService, SESSION_COOKIE, type SessionUser } from './auth.service.js'

/** Request carrying the session user the guard verified. */
export interface AuthenticatedRequest extends Request {
  /** Verified caller, present whenever the guard ran on a non-public route. */
  user?: SessionUser
}

/**
 * Requires a gateway session on /api/dsh routes and publishes the caller.
 *
 * Host traffic under /p/<id>/ owns its own handshake, but the proxy still checks
 * project ownership against the same cookie.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  /**
   * @param auth - session issuer and verifier.
   * @param reflector - reads the Public marker.
   */
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  /**
   * @param context - Nest execution context for the current request.
   * @returns true when the route is public or the request carries a valid session.
   */
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>('gateway:public', [context.getHandler(), context.getClass()])
    if (isPublic === true) return true
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const user = this.auth.verify(readCookie(request, SESSION_COOKIE))
    if (user === undefined) throw new UnauthorizedException('未登录网关')
    request.user = user
    return true
  }
}
