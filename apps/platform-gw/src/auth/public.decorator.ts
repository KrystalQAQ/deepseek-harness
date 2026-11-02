import { SetMetadata } from '@nestjs/common'

/** Marks a route as reachable without a gateway session. */
export const Public = (): MethodDecorator => SetMetadata('gateway:public', true)
