/** Database-side LLM usage recovered from a cognitive statement's own result row. */

import type { CognateQueryResult, CognateUsage } from './types.ts'

/** Column names AkashXDB uses for one usage figure, most specific first.
 * `ASK` reports per-stage counts only on deployments carrying the per-stage telemetry
 * build; older ones report a single answer-stage pair under the unprefixed names. Reading
 * the totals first keeps the rewrite and rerank stages in the figure wherever they exist,
 * and the unprefixed fallback is the answer stage alone -- an undercount, not a wrong
 * number, which is why it is last rather than absent. */
const INPUT_TOKEN_COLUMNS = ['TotalInputTokens', 'LLMInputTokens', 'InputTokens'] as const
const OUTPUT_TOKEN_COLUMNS = ['TotalOutputTokens', 'LLMOutputTokens', 'OutputTokens'] as const
const REASONING_TOKEN_COLUMNS = ['TotalReasoningTokens', 'LLMReasoningTokens'] as const

/** Stage wall-time columns, mapped to the stage name reported to callers. */
const STAGE_MS_COLUMNS: readonly (readonly [string, string])[] = [
  ['RewriteMs', 'rewrite'],
  ['EmbedMs', 'embed'],
]

/** Non-token billing columns, mapped to the unit name reported to callers.
 * Cohere and Foundry bill reranking in search units rather than tokens, so a statement
 * can carry real spend while every token column reads zero. */
const UNIT_COLUMNS: readonly (readonly [string, string])[] = [
  ['RerankSearchUnits', 'rerankSearchUnits'],
  ['RerankDocs', 'rerankDocs'],
  ['RerankTokens', 'rerankTokens'],
]

function numberAt(row: Record<string, unknown>, column: string): number | undefined {
  const value = row[column]
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  // AkashXDB returns the SET-variable columns as decimal strings over the MySQL wire.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function firstNumber(row: Record<string, unknown>, columns: readonly string[]): number | undefined {
  for (const column of columns) {
    const value = numberAt(row, column)
    if (value !== undefined) return value
  }
  return undefined
}

function stringAt(row: Record<string, unknown>, column: string): string | undefined {
  const value = row[column]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function collect(
  row: Record<string, unknown>,
  mappings: readonly (readonly [string, string])[],
): Record<string, number> | undefined {
  const collected: Record<string, number> = {}
  for (const [column, name] of mappings) {
    const value = numberAt(row, column)
    if (value !== undefined) collected[name] = value
  }
  return Object.keys(collected).length > 0 ? collected : undefined
}

/** Recover the deployment's own token spend from a completed cognitive statement.
 *
 * `ASK` returns its usage as columns of its single result row, so the figures are already
 * in hand and need no second round trip. `cognitive_ask` reports through the query profile
 * instead and is not covered here -- that path needs {@link CognateQueryResult.queryId}.
 *
 * These tokens are billed to the deployment's models, never to the harness's model; callers
 * that total the two must keep the routes apart.
 *
 * @param result - provider-normalized result of one executed statement.
 * @returns usage when the statement reported any, otherwise undefined.
 */
export function deriveUsage(result: CognateQueryResult): CognateUsage | undefined {
  if (result.kind !== 'cognitive') return undefined
  const row = result.rows[0]
  if (row === undefined) return undefined

  const inputTokens = firstNumber(row, INPUT_TOKEN_COLUMNS)
  const outputTokens = firstNumber(row, OUTPUT_TOKEN_COLUMNS)
  const reasoningTokens = firstNumber(row, REASONING_TOKEN_COLUMNS)
  const provider = stringAt(row, 'ModelProvider')
  const model = stringAt(row, 'ModelUsed')
  const stageMs = collect(row, STAGE_MS_COLUMNS)
  const units = collect(row, UNIT_COLUMNS)

  const usage: CognateUsage = {
    ...inputTokens !== undefined ? { inputTokens } : {},
    ...outputTokens !== undefined ? { outputTokens } : {},
    ...reasoningTokens !== undefined ? { reasoningTokens } : {},
    ...provider !== undefined ? { provider } : {},
    ...model !== undefined ? { model } : {},
    ...stageMs !== undefined ? { stageMs } : {},
    ...units !== undefined ? { units } : {},
  }
  return Object.keys(usage).length > 0 ? usage : undefined
}

/** Counter suffixes the query profile reports for one cognitive function. */
const PROFILE_COUNTERS = ['InputTokens', 'OutputTokens', 'CallCount', 'CumulativeTime', 'Model', 'Provider'] as const

/** Parse one RuntimeProfile duration, e.g. `17s286ms`, `286ms`, `1m30s`, `73.757us`.
 * @param text - duration as the profile prints it.
 * @returns milliseconds, or undefined when no unit was recognized.
 */
function parseDurationMs(text: string): number | undefined {
  const units: Readonly<Record<string, number>> = { h: 3_600_000, m: 60_000, s: 1000, ms: 1, us: 0.001, ns: 0.000_001 }
  let total: number | undefined
  // Longest units first so `ms` is never read as `m` followed by a stray `s`.
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(ns|us|ms|h|m|s)/g)) {
    const amount = Number(match[1])
    const scale = units[match[2] ?? '']
    if (!Number.isFinite(amount) || scale === undefined) continue
    total = (total ?? 0) + amount * scale
  }
  return total
}

/** Recover deployment usage from a query profile.
 *
 * `cognitive_ask` reports through RuntimeProfile counters rather than result columns, so the
 * figures arrive only by fetching the profile of the statement's own query id. Counters are
 * named `<function>.<counter>`; token counts carry an exact value in parentheses after an
 * abbreviated one (`37.011K (37011)`) and the exact value is the one taken.
 *
 * @param profile - profile document text as the deployment serves it.
 * @returns usage when the profile carries cognitive counters, otherwise undefined.
 */
export function parseProfileUsage(profile: string): CognateUsage | undefined {
  const found = new Map<string, string>()
  let fn: string | undefined
  for (const counter of PROFILE_COUNTERS) {
    const match = new RegExp(`([A-Za-z_][A-Za-z0-9_]*)\\.${counter}:\\s*([^\\n<]+)`).exec(profile)
    if (match?.[2] === undefined) continue
    fn ??= match[1]
    found.set(counter, match[2].trim())
  }
  if (fn === undefined) return undefined

  const exact = (counter: string): number | undefined => {
    const raw = found.get(counter)
    if (raw === undefined) return undefined
    // `37.011K (37011)` -- the parenthesized figure is the unrounded one.
    const parsed = Number(/\(([\d.]+)\)/.exec(raw)?.[1] ?? raw.replace(/[^\d.]/g, ''))
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const inputTokens = exact('InputTokens')
  const outputTokens = exact('OutputTokens')
  const callCount = exact('CallCount')
  const cumulative = found.get('CumulativeTime')
  const stageMs = cumulative === undefined ? undefined : parseDurationMs(cumulative)
  const model = found.get('Model')
  const provider = found.get('Provider')

  const usage: CognateUsage = {
    ...inputTokens !== undefined ? { inputTokens } : {},
    ...outputTokens !== undefined ? { outputTokens } : {},
    ...provider !== undefined ? { provider } : {},
    ...model !== undefined ? { model } : {},
    ...stageMs !== undefined ? { stageMs: { [fn]: stageMs } } : {},
    ...callCount !== undefined ? { units: { calls: callCount } } : {},
  }
  return Object.keys(usage).length > 0 ? usage : undefined
}
