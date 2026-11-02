import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuthModule } from '../auth/auth.module.js'
import { AuditLogEntity, ProjectEntity } from '../entities/entities.js'
import { DshModule } from '../dsh/dsh.module.js'
import { ProjectsController } from './projects.controller.js'
import { ProjectsService } from './projects.service.js'

/** Registers project directories and owns their lifecycle endpoints. */
@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([ProjectEntity, AuditLogEntity]), forwardRef(() => DshModule)],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
