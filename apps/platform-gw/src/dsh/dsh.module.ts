import { forwardRef, Module } from '@nestjs/common'

import { AuthModule } from '../auth/auth.module.js'
import { ProjectsModule } from '../projects/projects.module.js'
import { DshHostService } from './dsh-host.service.js'
import { ProxyService } from './proxy.service.js'

/** Owns the per-project Host processes and the /p/<id>/ proxy in front of them. */
@Module({
  imports: [AuthModule, forwardRef(() => ProjectsModule)],
  providers: [DshHostService, ProxyService],
  exports: [DshHostService, ProxyService],
})
export class DshModule {}
