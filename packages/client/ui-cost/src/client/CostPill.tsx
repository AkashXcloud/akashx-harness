/** What this session has cost so far, beside the counts it was priced from. */
import type { UseProjection } from '@akashx/akx-api-session-controller/client'
import type { PropsLocale } from '@akashx/akx-client-ui-slots'
// Type-only: merges the cognateUsage key into SessionProjectionMap for useProjection.
import type {} from '@akashx/akx-tool-cognate/client'
// Type-only: merges the tokenUsage key the same way.
import type {} from '@akashx/akx-token-meter/client'
import { formatUsd } from './rates.ts'
import type { SessionCost } from './rates.ts'
import css from './CostPill.module.css'

/** Props: the projection read seat, the rate card's arithmetic, and the locale seat. */
export type CostPillProps = {
  useProjection: UseProjection
  /** Price one session's projections; the rates live in the plugin's config. */
  price: (
    model: { provider?: string; model: string } | undefined,
    tokenUsage: unknown,
    cognateUsage: unknown,
  ) => SessionCost
} & PropsLocale<'cost'>

/**
 * Render the session's money pill.
 *
 * A session nobody has priced shows nothing at all rather than `$0`: an
 * unconfigured rate card is missing information, and a zero would state that
 * the work was free.
 *
 * @param props - the projection seat, the pricing function, and the locale seat.
 * @returns the pill, or null while the session is unpriced.
 */
export function CostPill({ useProjection, price, t }: CostPillProps) {
  const usage = useProjection('tokenUsage')
  const deployment = useProjection('cognateUsage')
  const selection = useProjection('modelSelection')
  const chosen = selection?.lastUsed ?? undefined
  const cost = price(
    chosen === undefined ? undefined : { provider: chosen.provider, model: chosen.model },
    usage,
    deployment,
  )
  const agent = cost.agentUsd
  const database = cost.deploymentUsd
  if (agent === undefined && database === undefined) return null
  const total = (agent ?? 0) + (database ?? 0)
  return (
    <span
      className={css.pill}
      data-cost-pill
      title={[
        agent === undefined ? undefined : t('pill.agent', { amount: formatUsd(agent) }),
        database === undefined ? undefined : t('pill.database', { amount: formatUsd(database) }),
        cost.unpriced.length === 0 ? undefined : t('pill.unpriced', { models: cost.unpriced.join(', ') }),
      ].filter(line => line !== undefined).join('\n')}
    >
      {formatUsd(total)}
    </span>
  )
}
