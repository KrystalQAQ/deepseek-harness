import { Controller, Get } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { Public } from './auth/public.decorator.js'

/** Liveness and dependency probes for the deployment, not for the shell. */
@Controller('api/dsh/health')
export class HealthController {
  /** @param dataSource - shared MySQL connection checked on every probe. */
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * @returns process health plus whether MySQL answered; probes read the 503.
   */
  @Public()
  @Get()
  async health() {
    let database = 'up'
    try {
      await this.dataSource.query('select 1')
    } catch {
      database = 'down'
    }
    return { data: { database, status: database === 'up' ? 'ok' : 'degraded' } }
  }
}
