import path from 'node:path'

import { DataSource } from 'typeorm'

import { AuditLogEntity, ProjectEntity, UserEntity } from '../entities/entities.js'

/**
 * Standalone data source for the TypeORM CLI.
 *
 * The Nest application builds its own options in typeorm.options.ts; this one
 * exists so `pnpm db:migrate` can run without booting the gateway.
 * @returns a data source reading the same GW_DB_* variables as the app.
 */
export function cliDataSource(): DataSource {
  const password = process.env.GW_DB_PASSWORD
  if (password === undefined || password === '') throw new Error('缺少环境变量 GW_DB_PASSWORD')
  return new DataSource({
    type: 'mysql',
    host: process.env.GW_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.GW_DB_PORT ?? 3306),
    username: process.env.GW_DB_USER ?? 'dsh',
    password,
    database: process.env.GW_DB_NAME ?? 'dsh_platform',
    charset: 'utf8mb4',
    timezone: 'local',
    entities: [ProjectEntity, AuditLogEntity, UserEntity],
    migrations: [path.join(import.meta.dirname, 'migrations', '*.js')],
    synchronize: false,
  })
}

/** Connection the CLI uses. */
export const AppDataSource = cliDataSource()
