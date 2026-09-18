/**
 * Turning a session's token counts into money.
 *
 * Every figure here is arithmetic over rates a deployment configured. Nothing
 * is inferred: a model with no configured rate makes the whole reading
 * unpriced rather than cheap, because a missing rate and a free model are
 * different facts and the second one is a claim.
 *
 * The agent's own spend and the deployment's stay apart all the way through,
 * for the reason the telemetry keeps them apart: they are billed to different
 * models at different prices, and the comparison the panel exists to draw is
 * exactly between them.
 *
 * @module @akashx/akx-client-ui-cost/rates
 */

/** What one model costs, in US dollars per million tokens. */
export interface ModelRate {
  /** Input tokens the provider billed in full. */
  readonly input: number
  /** Output tokens. */
  readonly output: number
  /** Input served from the provider's cache; defaults to {@link input}. */
  readonly cachedInput?: number
  /** Input written into the provider's cache; defaults to {@link input}. */
  readonly cacheWrite?: number
}

/** Configured rates, keyed `provider/model` and, as a fallback, bare `model`. */
export type RateCard = Readonly<Record<string, ModelRate>>

/** The harness-side token counts a session reports. */
export interface AgentTokens {
  readonly uncachedInputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly outputTokens: number
}

/** One deployment model's share of a session's retrieval spend. */
export interface DeploymentRoute {
  readonly provider: string
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
}

/** What a session cost, split by who was billed. */
export interface SessionCost {
  /** US dollars billed for the session's own model, or undefined when unpriced. */
  readonly agentUsd?: number
  /** US dollars billed for the deployment's models, or undefined when unpriced. */
  readonly deploymentUsd?: number
  /** Models that were used and carry no configured rate, in first-seen order. */
  readonly unpriced: readonly string[]
}

const PER_MILLION = 1_000_000

/**
 * Find the rate for one model.
 *
 * `provider/model` wins over a bare `model` so a deployment can price the same
 * model differently on two providers, which is the case that makes the
 * comparison worth drawing at all.
 *
 * @param rates - the configured card.
 * @param provider - provider id, when the caller knows it.
 * @param model - model id.
 * @returns the rate, or undefined when the card prices neither key.
 */
export function rateFor(
  rates: RateCard,
  provider: string | undefined,
  model: string,
): ModelRate | undefined {
  return (provider === undefined ? undefined : rates[`${provider}/${model}`]) ?? rates[model]
}

function usd(tokens: number, perMillion: number): number {
  return tokens <= 0 ? 0 : (tokens / PER_MILLION) * perMillion
}

/**
 * Price one session.
 *
 * @param rates - the configured card.
 * @param agent - the session's own model and token counts, absent before its first turn.
 * @param routes - the deployment models this session's retrieval spent on.
 * @returns both sides priced, with every unpriced model named.
 */
export function priceSession(
  rates: RateCard,
  agent: { provider?: string; model: string; tokens: AgentTokens } | undefined,
  routes: readonly DeploymentRoute[],
): SessionCost {
  const unpriced: string[] = []
  let agentUsd: number | undefined
  if (agent !== undefined) {
    const rate = rateFor(rates, agent.provider, agent.model)
    if (rate === undefined) unpriced.push(agent.model)
    else {
      agentUsd = usd(agent.tokens.uncachedInputTokens, rate.input)
        + usd(agent.tokens.cacheReadTokens, rate.cachedInput ?? rate.input)
        + usd(agent.tokens.cacheWriteTokens, rate.cacheWrite ?? rate.input)
        + usd(agent.tokens.outputTokens, rate.output)
    }
  }

  let deploymentUsd: number | undefined
  for (const route of routes) {
    const rate = rateFor(rates, route.provider, route.model)
    if (rate === undefined) {
      if (!unpriced.includes(route.model)) unpriced.push(route.model)
      continue
    }
    deploymentUsd = (deploymentUsd ?? 0)
      + usd(route.inputTokens, rate.input)
      + usd(route.outputTokens, rate.output)
  }

  return {
    ...agentUsd === undefined ? {} : { agentUsd },
    ...deploymentUsd === undefined ? {} : { deploymentUsd },
    unpriced,
  }
}

/**
 * Render one amount for a pill.
 *
 * Small amounts keep four decimals because a single question costs cents and a
 * figure rounded to two would read as zero for every lane, which is the
 * comparison collapsing rather than a cheap answer.
 *
 * @param amount - US dollars.
 * @returns the display string.
 */
export function formatUsd(amount: number): string {
  if (amount === 0) return '$0'
  if (amount < 0.01) return `$${amount.toFixed(4)}`
  if (amount < 1) return `$${amount.toFixed(3)}`
  return `$${amount.toFixed(2)}`
}
