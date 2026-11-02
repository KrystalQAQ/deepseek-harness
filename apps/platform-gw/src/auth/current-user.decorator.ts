import type { ExecutionContext } from '@nestjs/common'

import { createParamDecorator, UnauthorizedException } from '@nestjs/common'

import type { AuthenticatedRequest } from './session.guard.js'
import type { SessionUser } from './auth.service.js'

/**
 * Read the caller SessionGuard verified, for handlers that need an owner id.
 * @returns the session user; a missing user means the route forgot the guard.
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): SessionUser => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
  if (request.user === undefined) throw new UnauthorizedException('未登录网关')
  return request.user
})
