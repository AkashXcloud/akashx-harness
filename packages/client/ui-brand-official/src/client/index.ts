/** AkashX occupants for the generic browser-brand slots. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { AkashxMark, AkashxName } from './Brand.tsx'
import { en, type BrandKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    brand: BrandKey
  }
}

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Fill every browser-brand slot with the AkashX mark and name: the sidebar
 * identity, its collapsed rail, and the blank-session hero. Registration is
 * unconditional because this package ships the AkashX build; a build profile
 * must not be required for the product to carry its own brand.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  const locale = ctx.get('locale')
  if (locale !== undefined) ctx.effect(() => locale.register('brand', { en }), 'ui-brand-official: dictionaries')
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, AkashxMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name', locale: 'brand' }, AkashxName)
    }))
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark' }, AkashxMark))
}
