import { Module } from '@nestjs/common'

import { AuthModule } from './auth/auth.module.js'
import { GatewayConfigModule } from './config.module.js'
import { DatabaseModule } from './database/database.module.js'
import { DshModule } from './dsh/dsh.module.js'
import { HealthController } from './health.controller.js'
import { ProjectsModule } from './projects/projects.module.js'

/** Root module: configuration, database, accounts, projects, and the Host proxy. */
@Module({
  imports: [GatewayConfigModule, DatabaseModule, AuthModule, DshModule, ProjectsModule],
  controllers: [HealthController],
})
export class AppModule {}
