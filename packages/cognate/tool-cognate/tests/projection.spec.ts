import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@akashx/akx-session'
import { cognateUsageProjectionDefinition as unit } from '../src/projection.ts'

type State = ReturnType<typeof unit.init>

/** A `tool/result` carrying whatever this tool attached as its private metadata. */
function toolResult(meta: unknown): SessionEvent {
  return {
    type: 'tool/result',
    data: { turn: 1, step: 1, message: {}, ...meta === undefined ? {} : { meta } },
  } as unknown as SessionEvent
}

function fold(events: readonly SessionEvent[]): State {
  return events.reduce<State>((state, event) => unit.apply(state, event), unit.init())
}

const TREE = {
  usage: {
    input_tokens: 37_109, output_tokens: 5510, reasoning_tokens: 640,
    provider: 'foundry', model: 'gpt-5-nano',
    stage_ms: { cognitive_ask: 24_458 },
  },
}
const ASK = {
  usage: {
    input_tokens: 325, output_tokens: 346,
    provider: 'foundry', model: 'gpt-5-nano-2025-08-07',
    stage_ms: { rewrite: 431, embed: 88 },
  },
}

describe('cognateUsage projection', () => {
  it('accumulates deployment spend across statements', () => {
    const state = fold([toolResult(TREE), toolResult(ASK)])
    expect(state.inputTokens).toBe(37_434)
    expect(state.outputTokens).toBe(5856)
    expect(state.reasoningTokens).toBe(640)
    expect(state.calls).toBe(2)
    // Every stage of every statement, summed: 24458 + 431 + 88.
    expect(state.stageMs).toBe(24_977)
  })

  it('attributes spend per model rather than blending it into one total', () => {
    const state = fold([toolResult(TREE), toolResult(ASK), toolResult(TREE)])
    expect(state.routes).toEqual([
      { provider: 'foundry', model: 'gpt-5-nano', inputTokens: 74_218, outputTokens: 11_020, calls: 2 },
      { provider: 'foundry', model: 'gpt-5-nano-2025-08-07', inputTokens: 325, outputTokens: 346, calls: 1 },
    ])
  })

  it('ignores results that spent no deployment tokens', () => {
    const state = fold([
      toolResult(undefined),
      toolResult({ diff: 'some other tool metadata' }),
      { type: 'assistant/message', data: { turn: 1, step: 1 } } as unknown as SessionEvent,
    ])
    expect(state).toEqual(unit.init())
  })

  it('counts an unattributed statement without inventing a route for it', () => {
    const state = fold([toolResult({ usage: { input_tokens: 100, output_tokens: 20 } })])
    expect(state.inputTokens).toBe(100)
    expect(state.calls).toBe(1)
    expect(state.routes).toEqual([])
  })

  it('treats unusable figures as no spend rather than propagating NaN', () => {
    const state = fold([toolResult({
      usage: { input_tokens: 'lots', output_tokens: -5, stage_ms: { rewrite: Number.NaN } },
    })])
    expect(state.inputTokens).toBe(0)
    expect(state.outputTokens).toBe(0)
    expect(state.stageMs).toBe(0)
    expect(state.calls).toBe(1)
  })
})
