/**
 * Pricing a session: the two pools stay apart, a model nobody priced is
 * reported rather than treated as free, and the display keeps enough decimals
 * for a single question to show a figure at all.
 */

import { describe, expect, it } from 'vitest'
import { formatUsd, priceSession, rateFor } from '../src/client/rates.ts'
import type { RateCard } from '../src/client/rates.ts'

const RATES: RateCard = {
  'openai/big': { input: 10, output: 30, cachedInput: 1, cacheWrite: 12.5 },
  small: { input: 1, output: 2 },
}

const TOKENS = {
  uncachedInputTokens: 1_000_000,
  cacheReadTokens: 1_000_000,
  cacheWriteTokens: 1_000_000,
  outputTokens: 1_000_000,
}

describe('rateFor', () => {
  it('prefers the provider-qualified rate over the bare model', () => {
    const card: RateCard = { 'a/m': { input: 1, output: 1 }, m: { input: 9, output: 9 } }
    expect(rateFor(card, 'a', 'm')?.input).toBe(1)
    expect(rateFor(card, 'b', 'm')?.input).toBe(9)
    expect(rateFor(card, undefined, 'm')?.input).toBe(9)
  })

  it('has no rate for a model the card does not name', () => {
    expect(rateFor(RATES, 'openai', 'unknown')).toBeUndefined()
  })
})

describe('priceSession', () => {
  it('prices each token pool at its own rate', () => {
    const cost = priceSession(RATES, { provider: 'openai', model: 'big', tokens: TOKENS }, [])
    // 10 + 1 + 12.5 + 30, one million tokens of each.
    expect(cost.agentUsd).toBeCloseTo(53.5, 10)
    expect(cost.deploymentUsd).toBeUndefined()
    expect(cost.unpriced).toEqual([])
  })

  it('falls back to the input rate for cache reads and writes', () => {
    const cost = priceSession(RATES, { model: 'small', tokens: TOKENS }, [])
    // 1 + 1 + 1 input-priced pools, plus 2 for output.
    expect(cost.agentUsd).toBeCloseTo(5, 10)
  })

  it('keeps the deployment total apart from the agent total', () => {
    const cost = priceSession(RATES, { provider: 'openai', model: 'big', tokens: TOKENS }, [
      { provider: 'foundry', model: 'small', inputTokens: 2_000_000, outputTokens: 500_000 },
    ])
    expect(cost.agentUsd).toBeCloseTo(53.5, 10)
    expect(cost.deploymentUsd).toBeCloseTo(3, 10)
  })

  it('sums several deployment routes', () => {
    const cost = priceSession(RATES, undefined, [
      { provider: 'foundry', model: 'small', inputTokens: 1_000_000, outputTokens: 0 },
      { provider: 'foundry', model: 'small', inputTokens: 0, outputTokens: 1_000_000 },
    ])
    expect(cost.deploymentUsd).toBeCloseTo(3, 10)
    expect(cost.agentUsd).toBeUndefined()
  })

  it('reports an unpriced model rather than calling it free', () => {
    const cost = priceSession(RATES, { provider: 'openai', model: 'mystery', tokens: TOKENS }, [
      { provider: 'foundry', model: 'other', inputTokens: 10, outputTokens: 10 },
      { provider: 'foundry', model: 'other', inputTokens: 10, outputTokens: 10 },
    ])
    expect(cost.agentUsd).toBeUndefined()
    expect(cost.deploymentUsd).toBeUndefined()
    // Each unpriced model is named once, however many times it was used.
    expect(cost.unpriced).toEqual(['mystery', 'other'])
  })

  it('prices what it can when only one side is unpriced', () => {
    const cost = priceSession(RATES, undefined, [
      { provider: 'foundry', model: 'small', inputTokens: 1_000_000, outputTokens: 0 },
      { provider: 'foundry', model: 'other', inputTokens: 1_000_000, outputTokens: 0 },
    ])
    expect(cost.deploymentUsd).toBeCloseTo(1, 10)
    expect(cost.unpriced).toEqual(['other'])
  })

  it('prices nothing for a session that has not run', () => {
    expect(priceSession(RATES, undefined, [])).toEqual({ unpriced: [] })
  })

  it('ignores negative counts rather than crediting them', () => {
    const cost = priceSession(RATES, {
      model: 'small',
      tokens: { ...TOKENS, outputTokens: -1_000_000 },
    }, [])
    expect(cost.agentUsd).toBeCloseTo(3, 10)
  })
})

describe('formatUsd', () => {
  it('keeps four decimals for a question that costs a fraction of a cent', () => {
    expect(formatUsd(0.00421)).toBe('$0.0042')
  })

  it('keeps three decimals under a dollar and two above', () => {
    expect(formatUsd(0.4213)).toBe('$0.421')
    expect(formatUsd(12.345)).toBe('$12.35')
  })

  it('shows a real zero plainly', () => {
    expect(formatUsd(0)).toBe('$0')
  })
})
