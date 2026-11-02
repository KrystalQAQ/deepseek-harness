/**
 * Official browser-brand plugin, node half. The empty apply gives Loader a
 * host-side row while the browser half ships through `exports["./client"]`.
 */

import type {} from '@deepseek-ai/dsh-settings'

import type { Context } from '@deepseek-ai/cordis'

import type { Volatile } from '@deepseek-ai/cordis'

import z from '@deepseek-ai/schemastery'

/** Brand presentation projected to the browser. */
export interface Config {
  /** Deployment brand label; when set it replaces the official mark and wordmark. */
  title: Volatile<string | undefined>
}

/** Brand presentation schema; absent by default so official builds keep their artwork. */
export const Config = z.object({
  title: z.string().volatile(),
})

/**
 * Publish the brand configuration to the browser through the settings plane.
 * @param ctx - Plugin context used for the settings projection.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
