import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { CaptchaService } from './captcha.service.js'
import { SessionGuard } from './session.guard.js'
import { UserEntity } from '../entities/entities.js'

/** Verifies callers and exposes the account, captcha, and session endpoints the shell uses. */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, CaptchaService],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
