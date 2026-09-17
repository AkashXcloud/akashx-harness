import { describe, expect, it } from 'vitest'
import { deriveUsage, parseProfileUsage } from '../src/index.ts'
import type { CognateQueryResult } from '../src/index.ts'

function result(
  rows: readonly Record<string, unknown>[],
  kind: CognateQueryResult['kind'] = 'cognitive',
): CognateQueryResult {
  return {
    sql: "ASK 'q' ON bucket",
    kind,
    columns: [],
    rows: rows as CognateQueryResult['rows'],
    citations: [],
    externalOperation: kind === 'cognitive',
  }
}

describe('deriveUsage', () => {
  it('reads the per-stage totals a telemetry deployment reports', () => {
    expect(deriveUsage(result([{
      TotalInputTokens: 12_043,
      TotalOutputTokens: 1_208,
      TotalReasoningTokens: 640,
      ModelUsed: 'gpt-5-nano',
      ModelProvider: 'foundry',
      RewriteMs: 431,
      EmbedMs: 88,
      RerankSearchUnits: 2,
      RerankDocs: 200,
    }]))).toEqual({
      inputTokens: 12_043,
      outputTokens: 1_208,
      reasoningTokens: 640,
      model: 'gpt-5-nano',
      provider: 'foundry',
      stageMs: { rewrite: 431, embed: 88 },
      units: { rerankSearchUnits: 2, rerankDocs: 200 },
    })
  })

  it('prefers the totals over the answer-stage counts when both are present', () => {
    const usage = deriveUsage(result([{
      TotalInputTokens: 12_043,
      LLMInputTokens: 9_846,
      InputTokens: 9_846,
    }]))
    expect(usage?.inputTokens).toBe(12_043)
  })

  it('falls back to the unprefixed answer-stage pair on a pre-telemetry deployment', () => {
    expect(deriveUsage(result([{ InputTokens: 9_846, OutputTokens: 862 }])))
      .toEqual({ inputTokens: 9_846, outputTokens: 862 })
  })

  it('parses the decimal strings the wire returns for SET-variable columns', () => {
    expect(deriveUsage(result([{ TotalInputTokens: '12043', RewriteMs: '431' }])))
      .toEqual({ inputTokens: 12_043, stageMs: { rewrite: 431 } })
  })

  it('reports nothing for a statement that spends no deployment tokens', () => {
    expect(deriveUsage(result([{ id: 1, Company: 'Acme' }]))).toBeUndefined()
    expect(deriveUsage(result([]))).toBeUndefined()
  })

  it('ignores non-cognitive statements and unusable values', () => {
    expect(deriveUsage(result([{ TotalInputTokens: 12_043 }], 'read'))).toBeUndefined()
    expect(deriveUsage(result([{
      TotalInputTokens: Number.NaN,
      TotalOutputTokens: 'not-a-number',
      ModelUsed: '   ',
      RewriteMs: null,
    }]))).toBeUndefined()
  })
})

// Verbatim from a deployed AkashXDB query profile; the indentation, the abbreviated-then-exact
// token format and the compound duration are all as the deployment serves them.
const PROFILE = `
     - RowsReturned: 1
       - cognitive_ask.Model: gpt-5-nano
       - cognitive_ask.Provider: foundry
         - cognitive_ask.CallCount: 1
         - cognitive_ask.CumulativeTime: 21s823ms
         - cognitive_ask.InputTokens: 36.852K (36852)
         - cognitive_ask.OutputTokens: 2.907K (2907)
     - RowsRead: 1
`

describe('parseProfileUsage', () => {
  it('recovers concept-tree usage from a deployed query profile', () => {
    expect(parseProfileUsage(PROFILE)).toEqual({
      inputTokens: 36_852,
      outputTokens: 2_907,
      model: 'gpt-5-nano',
      provider: 'foundry',
      stageMs: { cognitive_ask: 21_823 },
      units: { calls: 1 },
    })
  })

  it.each([
    ['286ms', 286],
    ['1m30s', 90_000],
    ['73.757us', 0.073_757],
  ])('reads the %s duration as milliseconds', (text, ms) => {
    const usage = parseProfileUsage(`- cognitive_ask.CumulativeTime: ${text}\n`)
    expect(usage?.stageMs?.cognitive_ask).toBeCloseTo(ms, 5)
  })

  it('reports nothing for a profile without cognitive counters', () => {
    expect(parseProfileUsage('- RowsReturned: 1\n- TotalTime: 7s876ms\n')).toBeUndefined()
    expect(parseProfileUsage('')).toBeUndefined()
  })
})
