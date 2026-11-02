import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { CONFIG, type GatewayConfig } from '../config.js'
import { typeormOptions } from './typeorm.options.js'

/** Opens the MySQL pool and applies pending migrations before the app serves traffic. */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (config: GatewayConfig) => typeormOptions(config),
    }),
  ],
})
export class DatabaseModule {}
