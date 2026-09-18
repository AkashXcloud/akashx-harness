/**
 * Session cost, browser half: a configured rate card, the service that applies
 * it, and the pill that shows the result under the composer.
 *
 * Rates are deployment facts, not product ones — a model's price differs by
 * contract and changes without any code moving — so the card is validated
 * config and ships empty. An empty card prices nothing and the pill stays
 * hidden, which is the honest reading when nobody has said what a token costs.
 *
 * @module @akashx/akx-client-ui-cost/client
 */

import { Service } from '@akashx/cordis'
import type { Context } from '@akashx/cordis'
// Type-only: pulls the settings scope Context merge (ctx.settingsScope).
import type {} from '@akashx/akx-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@akashx/akx-client-locale/client'
// Type-only: pulls the slot registry service merge (ctx.slots).
import type {} from '@akashx/akx-client-ui-renderer/client'
// Type-only: pulls the composer dock slot declaration.
import type {} from '@akashx/akx-client-ui-conversation/client'
import { COST_SETTINGS_NAMESPACE } from '../cost-settings.ts'
import type { CostSettings } from '../cost-settings.ts'
import { CostPill } from './CostPill.tsx'
import { en, type CostKey } from './locales.ts'
import { priceSession } from './rates.ts'
import type { RateCard, SessionCost } from './rates.ts'

export type { ModelRate, RateCard, SessionCost } from './rates.ts'
export { formatUsd, priceSession, rateFor } from './rates.ts'

declare module '@akashx/cordis' {
  interface Context {
    cost: CostService
  }
}

declare module '@akashx/akx-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Cost pill copy. */
    cost: CostKey
  }
}

function tokensOf(usage: unknown): {
  uncachedInputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  outputTokens: number
} | undefined {
  if (typeof usage !== 'object' || usage === null) return undefined
  const read = (key: string): number => {
    const value = (usage as Record<string, unknown>)[key]
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  }
  return {
    uncachedInputTokens: read('uncachedInputTokens'),
    cacheReadTokens: read('cacheReadTokens'),
    cacheWriteTokens: read('cacheWriteTokens'),
    outputTokens: read('outputTokens'),
  }
}

function routesOf(usage: unknown): { provider: string; model: string; inputTokens: number; outputTokens: number }[] {
  if (typeof usage !== 'object' || usage === null) return []
  const routes = (usage as { routes?: unknown }).routes
  if (!Array.isArray(routes)) return []
  return routes.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return []
    const row = entry as Record<string, unknown>
    if (typeof row.provider !== 'string' || typeof row.model !== 'string') return []
    const count = (key: string): number => {
      const value = row[key]
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
    }
    return [{
      provider: row.provider,
      model: row.model,
      inputTokens: count('inputTokens'),
      outputTokens: count('outputTokens'),
    }]
  })
}

/**
 * Price one session's projection values against a card.
 *
 * @param rates - the configured card.
 * @param model - the model the session last ran, when it has run one.
 * @param tokenUsage - the session's `tokenUsage` projection value.
 * @param cognateUsage - the session's `cognateUsage` projection value.
 * @returns both sides priced, with every unpriced model named.
 */
export function priceValues(
  rates: RateCard,
  model: { provider?: string; model: string } | undefined,
  tokenUsage: unknown,
  cognateUsage: unknown,
): SessionCost {
  const tokens = tokensOf(tokenUsage)
  return priceSession(
    rates,
    model === undefined || tokens === undefined ? undefined : { ...model, tokens },
    routesOf(cognateUsage),
  )
}

/** Applies the deployment's rate card to whatever a session reports. */
export class CostService extends Service {
  constructor(ctx: Context, private readonly card: () => RateCard) {
    super(ctx, 'cost')
  }

  /**
   * Price one session from its projection values.
   *
   * The caller passes values rather than a session id because the two surfaces
   * that need this read them from different places: the pill from its own
   * session's projection seat, and Bridge from the Session list, which is the
   * only source that serves a session the client has not opened.
   *
   * @param model - the model the session last ran, when it has run one.
   * @param tokenUsage - the session's `tokenUsage` projection value.
   * @param cognateUsage - the session's `cognateUsage` projection value.
   * @returns both sides priced, with every unpriced model named.
   */
  price(
    model: { provider?: string; model: string } | undefined,
    tokenUsage: unknown,
    cognateUsage: unknown,
  ): SessionCost {
    return priceValues(this.card(), model, tokenUsage, cognateUsage)
  }
}

/**
 * Services this half reads. `remote` carries the forwarded settings
 * invalidation that `ctx.settingsScope.bind(spec)` subscribes to.
 */
export const inject = ['locale', 'slots', 'remote', 'settingsScope']

/**
 * Install the rate card's service and the composer pill.
 *
 * The card is read through the durable settings section rather than captured
 * once, so a rate corrected in the settings document reaches the next render
 * without a reload.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: Context): void {
  const host = ctx.settingsScope.bind<CostSettings>({ namespace: COST_SETTINGS_NAMESPACE })
  const card = (): RateCard => host.getSnapshot().value?.rates ?? {}
  ctx.effect(() => ctx.locale.register('cost', { en }), 'ui-cost: dictionaries')
  ctx.plugin(CostService, card)
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'cost',
    order: 10,
    locale: 'cost',
    // The card, not the service: this plugin publishes `cost` and a context
    // cannot read its own service without injecting it, so the pill prices
    // through the same arithmetic the service delegates to.
    inject: () => ({
      price: (
        model: { provider?: string; model: string } | undefined,
        tokenUsage: unknown,
        cognateUsage: unknown,
      ) => priceValues(card(), model, tokenUsage, cognateUsage),
    }),
  }, CostPill))
}
