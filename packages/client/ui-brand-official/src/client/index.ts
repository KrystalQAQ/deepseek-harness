/** Official DeepSeek Harness occupants for the generic browser-brand slots. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createElement } from 'react'
import { OfficialBrandMark, OfficialBrandName, ProjectBrandMark, ProjectBrandName } from './Brand.tsx'

/** Required services: the UI slot registry and the plugin configuration projection. */
export const inject = ['slots', 'configForms']

/** Brand configuration as the browser reads it. */
interface BrandConfig {
  title?: string
}

/** Plugin id owning the brand configuration form. */
const NAMESPACE = 'ui-brand-official'

/**
 * Read the deployment label, ignoring blank values and an unloaded scope.
 * @param scope - the brand configuration form.
 * @returns the trimmed label, or undefined when the official artwork applies.
 */
function readTitle(scope: ConfigForm<Record<string, unknown>>): string | undefined {
  const snapshot = scope.getSnapshot()
  if (snapshot.status !== 'ready') return undefined
  const title = (snapshot.value as BrandConfig | undefined)?.title
  return typeof title === 'string' && title.trim() !== '' ? title.trim() : undefined
}

/**
 * Fill the sidebar brand slots as one declaration-aware registration set. A
 * deployment label replaces both slots; otherwise the official build registers
 * the official artwork and every other build keeps the sidebar's fallbacks.
 * The conversation hero stays on its declaring package's animated fish
 * fallback, so no build registers anything there.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const scope = ctx.configForms.get<Record<string, unknown>>(NAMESPACE)
  let registration: (() => void) | undefined
  const sync = (): void => {
    registration?.()
    registration = undefined
    const title = readTitle(scope)
    if (title !== undefined) {
      registration = ctx.slots.inject('sidebar.brand.mark', () =>
        ctx.slots.inject('sidebar.brand.name', function* () {
          yield ctx.slots.register({ name: 'sidebar.brand.mark' }, ProjectBrandMark)
          yield ctx.slots.register({ name: 'sidebar.brand.name' }, () => createElement(ProjectBrandName, { title }))
        }))
      return
    }
    if (process.env.DSH_CLIENT_BUILD_PROFILE !== 'official') return
    registration = ctx.slots.inject('sidebar.brand.mark', () =>
      ctx.slots.inject('sidebar.brand.name', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, OfficialBrandMark)
        yield ctx.slots.register({ name: 'sidebar.brand.name' }, OfficialBrandName)
      }))
  }
  ctx.effect(() => {
    sync()
    const stop = scope.subscribe(sync)
    return () => {
      stop()
      registration?.()
    }
  }, 'ui-brand-official: brand slots')
}
