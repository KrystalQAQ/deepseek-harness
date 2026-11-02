import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common'

import type { SessionUser } from '../auth/auth.service.js'

import { CurrentUser } from '../auth/current-user.decorator.js'
import { SessionGuard } from '../auth/session.guard.js'
import { DshHostService } from '../dsh/dsh-host.service.js'
import { ProjectsService } from './projects.service.js'

/** Project registry API consumed by the shell's project pages. */
@Controller('api/dsh/projects')
@UseGuards(SessionGuard)
export class ProjectsController {
  /**
   * @param projects - project registry.
   * @param hosts - Host supervisor, told to stop a Host when its project is removed.
   */
  constructor(
    private readonly projects: ProjectsService,
    private readonly hosts: DshHostService,
  ) {}

  /**
   * @param user - verified caller; only that user's projects are listed.
   * @returns the caller's registered projects.
   */
  @Get()
  async list(@CurrentUser() user: SessionUser) {
    return { data: await this.projects.list(user.uid) }
  }

  /**
   * @param body - display name and absolute directory.
   * @param user - verified caller, recorded as the owner.
   * @returns the created project.
   */
  @Post()
  async create(@Body() body: { dir?: string; name?: string }, @CurrentUser() user: SessionUser) {
    return { data: await this.projects.create(body ?? {}, user) }
  }

  /**
   * @param id - project id.
   * @param user - verified caller.
   * @returns the removed project id.
   */
  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    await this.hosts.stop(id)
    return { data: { removed: await this.projects.remove(id, user) } }
  }
}
