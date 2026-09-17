/**
 * The `cognateUsage` projection unit: a pure fold of this tool's own result metadata
 * into whole-log totals for what the DEPLOYMENT's models spent.
 *
 * The fold reads `tool/result` `meta`, which the core documents as tool-private — the
 * producing tool owns its shape. That ownership is why this unit lives beside the tool
 * that writes the payload rather than in the generic token meter: nothing else may read
 * into another tool's metadata.
 *
 * Deployment spend is kept apart from the session's own model usage rather than summed
 * into it. The two pools are billed to different models at different prices, so a single
 * blended total would answer no question correctly; `routes` preserves who spent what.
 *
 * `run_sql` results carry usage only for cognitive statements, so ordinary reads and
 * metadata calls contribute nothing and the totals stay zero for a session that never
 * left SQL.
 *
 * @module @akashx/akx-tool-cognate/projection
 */

import { z } from 'zod'
import type { ProjectionDefinition } from '@akashx/akx-session-projection'
import type { CognateUsageRoute } from './types.ts'

const routeSchema = z.object({
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  calls: z.number().int().nonnegative(),
})

const cognateUsageSchema = z.object({
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  reasoningTokens: z.number().nonnegative(),
  calls: z.number().int().nonnegative(),
  stageMs: z.number().nonnegative(),
  routes: z.array(routeSchema),
})

/** Fold state. Kept distinct from the public `CognateUsageProjection` view because
 * the state rides the mutable shape the schema infers, while the view a consumer reads
 * is readonly. */
type CognateUsageState = z.infer<typeof cognateUsageSchema>

declare module '@akashx/akx-session-projection/types' {
  interface SessionProjectionStateMap {
    cognateUsage: CognateUsageState
  }
}

/** A finite, non-negative number, or 0 for anything else a result row could carry. */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** Sum the stage timings of one statement; the keys name pipeline stages and vary by path. */
function totalStageMs(value: unknown): number {
  if (typeof value !== 'object' || value === null) return 0
  return Object.values(value as Record<string, unknown>).reduce<number>((sum, ms) => sum + count(ms), 0)
}

/** The usage payload this tool attaches to its own result, when the statement reported any.
 * @param meta - the `tool/result` metadata payload, opaque to everything but this tool.
 * @returns the usage record, or undefined when the result carried none.
 */
function usageOf(meta: unknown): Record<string, unknown> | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const usage = (meta as { usage?: unknown }).usage
  return typeof usage === 'object' && usage !== null ? usage as Record<string, unknown> : undefined
}

/** Fold one statement's spend into the per-route totals, keyed by who billed it. */
function addRoute(
  routes: readonly CognateUsageRoute[],
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): CognateUsageRoute[] {
  const index = routes.findIndex(route => route.provider === provider && route.model === model)
  if (index === -1) return [...routes, { provider, model, inputTokens, outputTokens, calls: 1 }]
  return routes.map((route, at) => at !== index ? route : {
    ...route,
    inputTokens: route.inputTokens + inputTokens,
    outputTokens: route.outputTokens + outputTokens,
    calls: route.calls + 1,
  })
}

/** The `cognateUsage` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
export const cognateUsageProjectionDefinition = {
  key: 'cognateUsage',
  stateVersion: 1,
  stateSchema: cognateUsageSchema,
  init: (): CognateUsageState => ({
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    calls: 0,
    stageMs: 0,
    routes: [],
  }),
  apply: (state, event) => {
    if (event.type !== 'tool/result') return state
    const usage = usageOf(event.data.meta)
    if (usage === undefined) return state
    const inputTokens = count(usage.input_tokens)
    const outputTokens = count(usage.output_tokens)
    const provider = text(usage.provider)
    const model = text(usage.model)
    return {
      inputTokens: state.inputTokens + inputTokens,
      outputTokens: state.outputTokens + outputTokens,
      reasoningTokens: state.reasoningTokens + count(usage.reasoning_tokens),
      calls: state.calls + 1,
      stageMs: state.stageMs + totalStageMs(usage.stage_ms),
      // A statement that named neither provider nor model still counts in the totals; it
      // just cannot be attributed, and inventing a route label would misreport the price.
      routes: provider === undefined || model === undefined
        ? state.routes
        : addRoute(state.routes, provider, model, inputTokens, outputTokens),
    }
  },
  wire: { viewSchema: cognateUsageSchema, view: state => state },
} satisfies ProjectionDefinition<'cognateUsage', CognateUsageState>
