import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

/** Lifecycle of the Host process that serves one project. */
export const PROJECT_STATUSES = ['idle', 'starting', 'running', 'failed'] as const

/** One of PROJECT_STATUSES. */
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

/** One registered workspace, backed by exactly one dsh Host process. */
@Entity({ name: 'dsh_project' })
export class ProjectEntity {
  /** Stable short id used in /p/<id>/ URLs. */
  @PrimaryColumn({ length: 8, type: 'char' })
  id!: string

  /** Display name. */
  @Column({ length: 64 })
  name!: string

  /** Absolute directory the Host treats as its workspace root and process cwd. */
  @Index('UK_dsh_project_dir', { unique: true })
  @Column({ length: 512 })
  dir!: string

  /** Loopback port reserved for this project's Host; unique so two hosts never collide. */
  @Index('UK_dsh_project_port', { unique: true })
  @Column({ type: 'int' })
  port!: number

  /** Platform user id that owns the project. */
  @Index('IDX_dsh_project_owner')
  @Column({ length: 64, name: 'owner_uid' })
  ownerUid!: string

  /** Current Host lifecycle state. */
  @Column({ default: 'idle', enum: PROJECT_STATUSES, type: 'enum' })
  status!: ProjectStatus

  /** Last failure message, truncated to fit the column. */
  @Column({ length: 255, name: 'status_detail', nullable: true, type: 'varchar' })
  statusDetail!: null | string

  /** Registration time. */
  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date

  /** Last mutation time. */
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date

  /** Last time the Host reached its readiness line. */
  @Column({ name: 'last_started_at', nullable: true, type: 'datetime' })
  lastStartedAt!: Date | null
}

/** Account states; only active accounts may log in. */
export const USER_STATUSES = ['active', 'locked'] as const

/** One of USER_STATUSES. */
export type UserStatus = (typeof USER_STATUSES)[number]

/**
 * One platform account.
 *
 * Passwords are stored as scrypt hashes of the MD5 digest the shell sends, so the
 * plaintext password never leaves the browser in a form the server could replay.
 */
@Entity({ name: 'dsh_user' })
export class UserEntity {
  /** Stable id used as the project owner and the session subject. */
  @PrimaryColumn({ length: 32, type: 'char' })
  id!: string

  /** Login name; unique so accounts cannot shadow each other. */
  @Index('UK_dsh_user_username', { unique: true })
  @Column({ length: 64 })
  username!: string

  /** Name shown in the shell. */
  @Column({ length: 64, name: 'display_name' })
  displayName!: string

  /** scrypt hash of the MD5 hex digest, with its salt and parameters. */
  @Column({ length: 255, name: 'password_hash' })
  passwordHash!: string

  /** Whether the account may log in. */
  @Column({ default: 'active', enum: USER_STATUSES, type: 'enum' })
  status!: UserStatus

  /** Registration time. */
  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date

  /** Last mutation time. */
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date
}

/** Append-only record of who did what to which project. */
@Entity({ name: 'dsh_audit_log' })
@Index('IDX_dsh_audit_project', ['projectId', 'createdAt'])
export class AuditLogEntity {
  /** Auto-incrementing primary key. */
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string

  /** Project the action applied to. */
  @Column({ length: 8, name: 'project_id', type: 'char' })
  projectId!: string

  /** Platform user id that performed the action. */
  @Column({ length: 64, name: 'actor_uid' })
  actorUid!: string

  /** Action name such as create, remove, start, stop, fail. */
  @Column({ length: 32 })
  action!: string

  /** Free-form detail rendered as JSON for human inspection. */
  @Column({ nullable: true, type: 'json' })
  detail!: null | Record<string, unknown>

  /** When the action happened. */
  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date
}
