import { Global, Module } from '@nestjs/common'

import { CONFIG, loadConfig } from './config.js'

/** Provides the resolved gateway configuration to every feature module. */
@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: loadConfig }],
  exports: [CONFIG],
})
export class GatewayConfigModule {}
