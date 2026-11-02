import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { OnModuleInit } from '@nestjs/common'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CONFIG, type GatewayConfig } from '../config.js'
import { UserEntity } from '../entities/entities.js'

/** Name of the gateway's own session cookie. */
export const SESSION_COOKIE = 'gw_session'

/** Seven days, in seconds. */
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

/** Identity carried by a verified session. */
export interface SessionUser {
  /** Account id, used as the owner of the projects the session may see. */
  uid: string
  /** Display name shown by the shell. */
  name: string
  /** Login name the account signs in with. */
  username: string
}

interface SessionPayload extends SessionUser {
  /** Expiry, in seconds since the epoch. */
  exp: number
}

/** Thrown when credentials do not verify; the controller maps it to HTTP 401. */
export class UnauthorizedError extends Error {}

/**
 * Owns every credential decision in the gateway: accounts, password hashes, the
 * platform bearer token the shell carries, and the gateway session cookie.
 *
 * The shell posts the password over its own connection and the server hashes it
 * with scrypt; nothing derived from the password is stored in plaintext.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name)
  private readonly secret: Buffer

  /**
   * @param config - resolved gateway configuration.
   * @param users - account table.
   */
  constructor(
    @Inject(CONFIG) private readonly config: GatewayConfig,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
  ) {
    const file = path.join(config.dataDir, 'session.secret')
    mkdirSync(config.dataDir, { recursive: true })
    if (existsSync(file)) {
      this.secret = Buffer.from(readFileSync(file, 'utf8').trim(), 'hex')
    } else {
      this.secret = randomBytes(32)
      writeFileSync(file, this.secret.toString('hex'), { mode: 0o600 })
    }
  }

  /** Create the first administrator when the account table is still empty. */
  async onModuleInit(): Promise<void> {
    if ((await this.users.count()) > 0) return
    const password = this.config.auth.adminPassword
    await this.users.save(
      this.users.create({
        displayName: '管理员',
        id: randomBytes(16).toString('hex'),
        passwordHash: this.hashPassword(password),
        username: 'admin',
      }),
    )
    this.logger.warn(
      '已创建初始管理员 admin；密码取自 ' +
        (process.env.GW_ADMIN_PASSWORD === undefined ? '默认值 admin123456，请立刻设置 GW_ADMIN_PASSWORD 并改密' : 'GW_ADMIN_PASSWORD'),
    )
  }

  /**
   * Verify a login name and password digest.
   * @param input - login name and the MD5 hex digest the shell posts.
   * @returns the verified account.
   */
  async authenticatePassword(input: { password: string; username: string }): Promise<SessionUser> {
    const user = await this.users.findOneBy({ username: input.username })
    if (user === null) throw new UnauthorizedError('账号或密码不正确')
    if (user.status !== 'active') throw new UnauthorizedError('账号已停用')
    if (!this.verifyPassword(input.password, user.passwordHash)) throw new UnauthorizedError('账号或密码不正确')
    return { name: user.displayName, uid: user.id, username: user.username }
  }

  /**
   * Verify the shell's bearer token.
   * @param input - the token the shell already holds.
   * @returns the user that token was issued to.
   */
  authenticate(input: { token?: string }): SessionUser {
    if (input.token === undefined || input.token === '') throw new UnauthorizedError('缺少平台访问令牌')
    const user = this.verifyPlatformToken(input.token)
    if (user === undefined) throw new UnauthorizedError('平台令牌无效或已过期')
    return user
  }

  /**
   * Mint the bearer token the shell stores for the rest of the session.
   * @param user - verified account.
   * @returns the opaque token.
   */
  issuePlatformToken(user: SessionUser): string {
    const exp = String(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS)
    const payload =
      [user.uid, user.name, user.username].map(part => Buffer.from(part, 'utf8').toString('base64url')).join('.') + '.' + exp
    return payload + '.' + this.sign('platform', payload)
  }

  /**
   * @param token - value produced by issuePlatformToken().
   * @returns the user, or undefined when the token is forged or expired.
   */
  verifyPlatformToken(token: string): SessionUser | undefined {
    const parts = token.split('.')
    if (parts.length !== 5) return undefined
    const [encodedUid, encodedName, encodedUsername, exp, signature] = parts as [string, string, string, string, string]
    const payload = [encodedUid, encodedName, encodedUsername, exp].join('.')
    if (!this.compare(signature, this.sign('platform', payload))) return undefined
    if (Number(exp) * 1000 < Date.now()) return undefined
    return {
      name: Buffer.from(encodedName, 'base64url').toString('utf8'),
      uid: Buffer.from(encodedUid, 'base64url').toString('utf8'),
      username: Buffer.from(encodedUsername, 'base64url').toString('utf8'),
    }
  }

  /**
   * Mint a signed cookie value carrying a short-lived challenge.
   * @param kind - purpose tag, so one signature cannot be replayed as another.
   * @param text - payload to protect.
   * @param ttlSeconds - lifetime.
   * @returns cookie-safe value.
   */
  signChallenge(kind: string, text: string, ttlSeconds: number): string {
    const exp = String(Math.floor(Date.now() / 1000) + ttlSeconds)
    const payload = Buffer.from(text, 'utf8').toString('base64url') + '.' + exp
    return payload + '.' + this.sign(kind, text + '.' + exp)
  }

  /**
   * @param kind - purpose tag used when signing.
   * @param value - cookie value produced by signChallenge().
   * @returns the payload, or undefined when forged or expired.
   */
  readChallenge(kind: string, value: string | undefined): string | undefined {
    if (value === undefined) return undefined
    const parts = value.split('.')
    if (parts.length !== 3) return undefined
    const [encoded, exp, signature] = parts as [string, string, string]
    const text = Buffer.from(encoded, 'base64url').toString('utf8')
    if (!this.compare(signature, this.sign(kind, text + '.' + exp))) return undefined
    if (Number(exp) * 1000 < Date.now()) return undefined
    return text
  }

  /**
   * Mint a signed session cookie value.
   * @param user - verified identity.
   * @returns the cookie value.
   */
  issue(user: SessionUser): string {
    const payload: SessionPayload = {
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      name: user.name,
      uid: user.uid,
      username: user.username,
    }
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    return encoded + '.' + this.sign('session', encoded)
  }

  /**
   * Verify a session cookie value.
   * @param value - cookie value produced by issue().
   * @returns the session user, or undefined when the value is forged or expired.
   */
  verify(value: string | undefined): SessionUser | undefined {
    if (value === undefined) return undefined
    const separator = value.lastIndexOf('.')
    if (separator === -1) return undefined
    const encoded = value.slice(0, separator)
    const signature = value.slice(separator + 1)
    if (!this.compare(signature, this.sign('session', encoded))) return undefined
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload
      if (payload.exp * 1000 < Date.now()) return undefined
      if (typeof payload.uid !== 'string' || payload.uid === '') return undefined
      return { name: payload.name, uid: payload.uid, username: payload.username }
    } catch {
      // A signature-valid payload that cannot be parsed means the secret was reused with another format.
      return undefined
    }
  }

  /** @returns the session cookie lifetime in seconds. */
  ttlSeconds(): number {
    return SESSION_TTL_SECONDS
  }

  /**
   * Hash a password for storage.
   * @param password - plaintext password from the login form.
   * @returns salt and hash, both hex, joined by `$`.
   */
  hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex')
    return salt + '$' + scryptSync(password, salt, 64).toString('hex')
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split('$')
    if (salt === undefined || hash === undefined) return false
    return this.compare(scryptSync(password, salt, 64).toString('hex'), hash)
  }

  private compare(left: string, right: string): boolean {
    const a = Buffer.from(left, 'utf8')
    const b = Buffer.from(right, 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private sign(kind: string, text: string): string {
    return createHmac('sha256', this.secret).update(kind + ':' + text).digest('base64url')
  }
}
