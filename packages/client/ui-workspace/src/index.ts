/**
 * Workspace picker plugin, node half. Pure UI plugin: the empty apply exists
 * so the plugin appears in the host cordis.yml / Loader (load and lifecycle
 * follow the host; the browser half ships via exports["./client"], discovered
 * through the package.json dsh.client declaration).
 */

import type {} from '@deepseek-ai/dsh-settings'

import type { Context, Volatile } from '@deepseek-ai/cordis'

import z from '@deepseek-ai/schemastery'

/** Browser presentation options projected to the client. */
export interface Config {
  /** List Sessions without Workspace header rows; a one-Host-per-project deployment sets this. */
  sessionsOnly: Volatile<boolean | undefined>
  /** Show the Workspace picker above the composer; a deployment that binds one Workspace turns it off. */
  hero: Volatile<boolean | undefined>
}

/** Presentation schema; Workspace header rows stay on unless a deployment turns them off. */
export const Config = z.object({
  sessionsOnly: z.boolean().volatile(),
  hero: z.boolean().volatile(),
})

/**
 * Publish the presentation options to the browser through the settings plane.
 * @param ctx - Plugin context used for the settings projection.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
