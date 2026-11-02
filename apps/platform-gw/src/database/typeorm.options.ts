import { TypeOrmModuleOptions } from '@nestjs/typeorm'

import type { GatewayConfig } from '../config.js'
import { AuditLogEntity, ProjectEntity, UserEntity } from '../entities/entities.js'

/**
 * Build the TypeORM connection options from resolved configuration.
 *
 * Schema changes only ever come from migrations: `synchronize` stays off so a
 * deployed database never drifts because an entity changed.
 * @param config - resolved gateway configuration.
 * @returns options for TypeOrmModule.
 */
export function typeormOptions(config: GatewayConfig): TypeOrmModuleOptions {
  return {
    type: 'mysql',
    host: config.database.host,
    port: config.database.port,
    username: config.database.user,
    password: config.database.password,
    database: config.database.name,
    charset: 'utf8mb4',
    timezone: 'local',
    entities: [ProjectEntity, AuditLogEntity, UserEntity],
    migrations: [import.meta.dirname + '/migrations/*.js'],
    migrationsRun: config.database.runMigrations,
    synchronize: false,
    retryAttempts: 3,
    retryDelay: 2000,
    extra: {
      connectionLimit: 10,
      connectTimeout: 10_000,
    },
  }
}
