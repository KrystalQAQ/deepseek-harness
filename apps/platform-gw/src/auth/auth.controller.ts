import type { Request, Response } from 'express'

import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common'

import { readCookie, sessionCookie } from '../common/cookies.js'
import { AuthService, SESSION_COOKIE, UnauthorizedError } from './auth.service.js'
import { CAPTCHA_COOKIE, CaptchaService } from './captcha.service.js'

/** Identity the shell stores after a successful login. */
export interface SessionPayload {
  /** Account id. */
  id: string
  /** Display name. */
  name: string
  /** Login name. */
  username: string
}

/**
 * Accounts, captcha, and sessions for the shell.
 *
 * One login sets the session cookie that iframe traffic uses and returns the
 * bearer token the shell sends on its own requests, so neither side needs a
 * second round trip.
 */
@Controller('api/auth')
export class AuthController {
  /**
   * @param auth - password, token, and session authority.
   * @param captcha - challenge issuer.
   */
  constructor(
    private readonly auth: AuthService,
    private readonly captcha: CaptchaService,
  ) {}

  /**
   * Draw a captcha image and bind the next login to it.
   * @param response - response that receives the challenge cookie.
   * @returns the SVG image the login form renders.
   */
  @Get('captcha')
  captchaImage(@Res({ passthrough: true }) response: Response): string {
    const challenge = this.captcha.challenge()
    response.setHeader('content-type', 'image/svg+xml; charset=utf-8')
    response.setHeader('set-cookie', sessionCookie(CAPTCHA_COOKIE, challenge.cookie, 120))
    return challenge.svg
  }

  /**
   * Verify credentials and open a session.
   * @param body - login name, password, and the code drawn in the image.
   * @param request - request carrying the captcha cookie.
   * @param response - response that receives the session cookie.
   * @returns the bearer token and the signed-in user.
   */
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: { captcha?: string; password?: string; username?: string },
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: { token: string; user: SessionPayload } }> {
    if (!this.captcha.verify(readCookie(request, CAPTCHA_COOKIE), body.captcha ?? '')) {
      throw new UnauthorizedException('验证码不正确或已过期')
    }
    try {
      const user = await this.auth.authenticatePassword({ password: body.password ?? '', username: body.username ?? '' })
      response.setHeader('set-cookie', sessionCookie(SESSION_COOKIE, this.auth.issue(user), this.auth.ttlSeconds()))
      return {
        data: {
          token: this.auth.issuePlatformToken(user),
          user: { id: user.uid, name: user.name, username: body.username ?? '' },
        },
      }
    } catch (error) {
      if (error instanceof UnauthorizedError) throw new UnauthorizedException(error.message)
      throw error
    }
  }

  /**
   * @param request - request carrying the session cookie or bearer token.
   * @returns the signed-in user.
   */
  @Get('me')
  me(@Req() request: Request): { data: SessionPayload } {
    const header = request.headers.authorization ?? ''
    const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
    const user =
      (bearer === '' ? undefined : this.auth.verifyPlatformToken(bearer)) ??
      this.auth.verify(readCookie(request, SESSION_COOKIE))
    if (user === undefined) throw new UnauthorizedException('未登录')
    return { data: { id: user.uid, name: user.name, username: user.name } }
  }

  /**
   * Drop the session and captcha cookies.
   * @param response - response that expires them.
   * @returns an empty acknowledgement.
   */
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response): { data: null } {
    response.setHeader('set-cookie', [sessionCookie(SESSION_COOKIE, '', 0), sessionCookie(CAPTCHA_COOKIE, '', 0)])
    return { data: null }
  }
}
