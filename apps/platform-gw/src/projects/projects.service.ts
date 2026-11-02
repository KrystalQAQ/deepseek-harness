import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CONFIG, type GatewayConfig } from '../config.js'
import { AuditLogEntity, ProjectEntity, type ProjectStatus } from '../entities/entities.js'

/** Project row as the shell sees it. */
export interface Project {
  /** Stable short id used in /p/<id>/ URLs. */
  id: string
  /** Display name. */
  name: string
  /** Absolute directory the Host treats as its workspace root and process cwd. */
  dir: string
  /** Loopback port reserved for this project's Host. */
  port: number
  /** Platform user id that owns the project. */
  ownerUid: string
  /** Current Host lifecycle state. */
  status: ProjectStatus
  /** Last failure message, when status is failed. */
  statusDetail: null | string
  /** ISO timestamp of registration. */
  createdAt: string
  /** ISO timestamp of the last readiness handshake. */
  lastStartedAt: null | string
}

/**
 * MySQL-backed project registry.
 *
 * Every mutation that changes which projects exist, or which Host states they
 * reached, appends to the audit log, so a lost Host or a deleted project can be
 * reconstructed after the fact.
 */
@Injectable()
export class ProjectsService {
  /**
   * @param config - resolved gateway configuration.
   * @param projects - project table.
   * @param audit - append-only audit table.
   */
  constructor(
    @Inject(CONFIG) private readonly config: GatewayConfig,
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(AuditLogEntity) private readonly audit: Repository<AuditLogEntity>,
  ) {}

  /**
   * @param ownerUid - platform user id of the caller.
   * @returns that user's projects, in registration order.
   */
  async list(ownerUid: string): Promise<Project[]> {
    const rows = await this.projects.find({ order: { createdAt: 'ASC' }, where: { ownerUid } })
    return rows.map(row => this.toProject(row))
  }

  /**
   * @param id - project id.
   * @param ownerUid - platform user id of the caller.
   * @returns the project.
   */
  async get(id: string, ownerUid: string): Promise<Project> {
    const row = await this.projects.findOneBy({ id, ownerUid })
    if (row === null) throw new NotFoundException('项目不存在: ' + id)
    return this.toProject(row)
  }

  /**
   * @param id - project id, without an ownership check.
   * @returns the project row, or undefined.
   */
  async find(id: string): Promise<ProjectEntity | undefined> {
    return (await this.projects.findOneBy({ id })) ?? undefined
  }

  /**
   * Register an existing absolute directory as a project owned by the caller.
   * @param input - display name and directory.
   * @param user - verified caller.
   * @returns the created project.
   */
  async create(input: { dir?: string; name?: string }, user: { name: string; uid: string }): Promise<Project> {
    const dir = (input.dir ?? '').trim()
    const name = (input.name ?? '').trim()
    if (dir === '' || !path.isAbsolute(dir)) throw new BadRequestException('目录必须是绝对路径')
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new BadRequestException('目录不存在: ' + dir)
    const resolved = path.resolve(dir)
    if ((await this.projects.findOneBy({ dir: resolved })) !== null) {
      throw new BadRequestException('该目录已登记为项目')
    }

    const row = this.projects.create({
      dir: resolved,
      id: randomUUID().replace(/-/g, '').slice(0, 8),
      name: name === '' ? path.basename(resolved) : name,
      ownerUid: user.uid,
      port: await this.nextPort(),
    })
    await this.projects.save(row)
    await this.record(row.id, user.uid, 'create', { dir: resolved, name: row.name, port: row.port })
    return this.toProject(row)
  }

  /**
   * Delete a project the caller owns.
   * @param id - project id.
   * @param user - verified caller.
   * @returns whether a row was removed.
   */
  async remove(id: string, user: { uid: string }): Promise<boolean> {
    const row = await this.projects.findOneBy({ id, ownerUid: user.uid })
    if (row === null) return false
    await this.projects.delete({ id })
    await this.record(id, user.uid, 'remove', { dir: row.dir, port: row.port })
    return true
  }

  /**
   * @param id - project id.
   * @param status - lifecycle state to persist.
   * @param detail - failure message, cleared for non-failure states.
   */
  async setStatus(id: string, status: ProjectStatus, detail?: string): Promise<void> {
    await this.projects.update(
      { id },
      { status, statusDetail: status === 'failed' ? String(detail ?? '').slice(0, 255) : null },
    )
  }

  /**
   * @param id - project id that just answered its readiness line.
   * @param actorUid - platform user whose request started it, when known.
   */
  async markRunning(id: string, actorUid?: string): Promise<void> {
    await this.projects.update({ id }, { lastStartedAt: new Date(), status: 'running', statusDetail: null })
    await this.record(id, actorUid ?? 'system', 'start', {})
  }

  /**
   * @param id - project id whose Host exited or failed to start.
   * @param reason - human-readable cause.
   */
  async markFailed(id: string, reason: string): Promise<void> {
    await this.setStatus(id, 'failed', reason)
    await this.record(id, 'system', 'fail', { reason: String(reason).slice(0, 255) })
  }

  /**
   * @param id - project id whose Host was stopped on purpose.
   * @param actorUid - platform user whose request stopped it, when known.
   */
  async markIdle(id: string, actorUid?: string): Promise<void> {
    await this.setStatus(id, 'idle')
    await this.record(id, actorUid ?? 'system', 'stop', {})
  }

  /**
   * Append one audit row; a failing audit write never fails the caller's action.
   * @param projectId - project the action applied to.
   * @param actorUid - platform user id, or `system`.
   * @param action - verb such as create, remove, start, stop, fail.
   * @param detail - structured context.
   */
  async record(projectId: string, actorUid: string, action: string, detail: Record<string, unknown>): Promise<void> {
    try {
      const row = new AuditLogEntity()
      row.action = action
      row.actorUid = actorUid
      row.detail = detail
      row.projectId = projectId
      await this.audit.save(row)
    } catch {
      // Audit rows are diagnostic, not transactional: the caller's action already committed.
    }
  }

  private async nextPort(): Promise<number> {
    const highest = await this.projects.maximum('port')
    return highest === null || highest < this.config.dshBasePort ? this.config.dshBasePort : Number(highest) + 1
  }

  private toProject(row: ProjectEntity): Project {
    return {
      createdAt: row.createdAt.toISOString(),
      dir: row.dir,
      id: row.id,
      lastStartedAt: row.lastStartedAt === null ? null : row.lastStartedAt.toISOString(),
      name: row.name,
      ownerUid: row.ownerUid,
      port: row.port,
      status: row.status,
      statusDetail: row.statusDetail,
    }
  }
}
