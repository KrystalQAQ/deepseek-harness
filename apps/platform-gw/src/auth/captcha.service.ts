import { randomInt } from 'node:crypto'

import { Injectable } from '@nestjs/common'

import { AuthService } from '../auth/auth.service.js'

/** Characters used in a challenge; no 0/O or 1/I so the image stays readable. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Cookie carrying the challenge the image was drawn from. */
export const CAPTCHA_COOKIE = 'gw_captcha'

/** How long one challenge stays valid, in seconds. */
const CAPTCHA_TTL_SECONDS = 120

/** Result of drawing a challenge: the cookie value and the image to show. */
export interface Challenge {
  /** Signed cookie value that binds the next login to this image. */
  cookie: string
  /** SVG markup of the distorted code. */
  svg: string
}

/**
 * Issues and checks the login captcha.
 *
 * The code never leaves the server in the cookie: only a signed copy does, so a
 * client cannot read the answer out of its own storage.
 */
@Injectable()
export class CaptchaService {
  /** @param auth - signer for the challenge cookie. */
  constructor(private readonly auth: AuthService) {}

  /**
   * Draw a new challenge.
   * @returns the cookie value and the image it belongs to.
   */
  challenge(): Challenge {
    let code = ''
    for (let index = 0; index < 4; index++) code += ALPHABET[randomInt(ALPHABET.length)]
    return { cookie: this.auth.signChallenge('captcha', code, CAPTCHA_TTL_SECONDS), svg: this.draw(code) }
  }

  /**
   * Check a submitted code against the cookie the client holds.
   * @param cookie - CAPTCHA_COOKIE value from the request.
   * @param input - code the user typed.
   * @returns whether the code matches and has not expired.
   */
  verify(cookie: string | undefined, input: string): boolean {
    const expected = this.auth.readChallenge('captcha', cookie)
    if (expected === undefined) return false
    return expected.toLowerCase() === input.trim().toLowerCase()
  }

  private draw(code: string): string {
    const glyphs = [...code]
      .map((char, index) => {
        const x = 16 + index * 26
        const y = 30 + randomInt(-3, 4)
        const rotate = randomInt(-18, 19)
        return (
          '<text x="' +
          x +
          '" y="' +
          y +
          '" font-family="monospace" font-size="26" font-weight="700" fill="#1f2d5a" transform="rotate(' +
          rotate +
          ' ' +
          x +
          ' ' +
          y +
          ')">' +
          char +
          '</text>'
        )
      })
      .join('')
    const lines = Array.from({ length: 4 }, () => {
      const y1 = randomInt(4, 40)
      const y2 = randomInt(4, 40)
      return (
        '<line x1="0" y1="' +
        y1 +
        '" x2="120" y2="' +
        y2 +
        '" stroke="#8aa4d6" stroke-width="1" opacity="0.6"/>'
      )
    }).join('')
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">' +
      '<rect width="120" height="40" fill="#f2f6ff"/>' +
      lines +
      glyphs +
      '</svg>'
    )
  }
}
