/** Official DeepSeek Harness occupants for the generic browser-brand slots. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { OfficialBrandMark, OfficialBrandName } from './Brand.tsx'
import { en, zh, type BrandKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    brand: BrandKey
  }
}

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Fill the sidebar brand slots as one declaration-aware registration set. The
 * conversation hero stays on its declaring package's animated fish fallback,
 * so the official build registers nothing there.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const locale = ctx.get('locale')
  if (locale !== undefined) ctx.effect(() => locale.register('brand', { zh, en }), 'ui-brand-official: dictionaries')
  if (process.env.DSH_CLIENT_BUILD_PROFILE !== 'official') return
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, OfficialBrandMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name', locale: 'brand' }, OfficialBrandName)
    }))
}
