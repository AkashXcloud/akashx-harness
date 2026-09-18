import { describe, expect, it } from 'vitest'
import { dealBlind, judgePrompt, readVerdicts } from '../src/client/judge.ts'
import { readLane } from '../src/client/lane-watch.ts'

const ENTRIES = [
  { key: 'lane-1', answer: '$32,765 million' },
  { key: 'lane-2', answer: 'about 1540' },
  { key: 'lane-3', answer: '$32.765 billion' },
]

/** A fixed shuffle source, so the deal is the same every run. */
const fixed = () => 0

describe('dealBlind', () => {
  it('replaces every lane with a letter', () => {
    const dealt = dealBlind(ENTRIES, fixed)
    expect(dealt.map(entry => entry.letter)).toEqual(['A', 'B', 'C'])
    expect(dealt.map(entry => entry.entry.key).sort()).toEqual(['lane-1', 'lane-2', 'lane-3'])
  })

  it('does not present lanes in their panel order', () => {
    // This source swaps the last element to the front on each pass, so a deal
    // still matching panel order would mean the shuffle never ran.
    expect(dealBlind(ENTRIES, fixed).map(d => d.entry.key)).not.toEqual(['lane-1', 'lane-2', 'lane-3'])
  })
})

describe('judgePrompt', () => {
  it('carries the question, the gold answer and every lettered answer', () => {
    const prompt = judgePrompt('3M revenue 2018?', '$32,765 million', dealBlind(ENTRIES, fixed))
    expect(prompt).toContain('QUESTION: 3M revenue 2018?')
    expect(prompt).toContain('CORRECT ANSWER: $32,765 million')
    expect(prompt).toContain('about 1540')
  })

  it('asks for a grade short enough to survive the response preview clip', () => {
    // The host clips a turn's response preview to 120 characters; a reply that
    // spent a line per answer would lose its last verdicts to that clip.
    const prompt = judgePrompt('q', 'g', dealBlind(ENTRIES, fixed))
    expect(prompt).toMatch(/ONE short line/i)
    expect('A=correct B=wrong:says-1540 C=correct'.length).toBeLessThan(120)
  })

  it('forbids the grader looking the answer up for itself', () => {
    expect(judgePrompt('q', 'g', dealBlind(ENTRIES, fixed))).toMatch(/do not run any query/i)
  })

  it('names no lane, so a grade cannot follow the mode', () => {
    expect(judgePrompt('q', 'g', dealBlind(ENTRIES, fixed))).not.toContain('lane-')
  })
})

describe('readVerdicts', () => {
  const dealt = dealBlind(ENTRIES, fixed)
  const keyOf = (letter: string) => dealt.find(d => d.letter === letter)?.entry.key

  it('reads a verdict per graded letter', () => {
    const verdicts = readVerdicts('A=correct B=wrong:wrong-figure C=correct', dealt)
    expect(verdicts).toHaveLength(3)
    expect(verdicts.find(v => v.key === keyOf('A'))?.correct).toBe(true)
    const wrong = verdicts.find(v => v.key === keyOf('B'))
    expect(wrong?.correct).toBe(false)
    expect(wrong?.reason).toBe('wrong figure')
  })

  it('tolerates the decoration a model adds around the line', () => {
    const verdicts = readVerdicts('**A=correct** B=incorrect:states-1540, C=correct', dealt)
    expect(verdicts).toHaveLength(3)
    expect(verdicts.find(v => v.key === keyOf('B'))?.reason).toBe('states 1540')
  })

  it('leaves an ungraded answer without a verdict rather than failing it', () => {
    expect(readVerdicts('A=correct', dealt).map(v => v.key)).toEqual([keyOf('A')])
  })

  it('returns nothing for a reply that graded nothing', () => {
    expect(readVerdicts('I could not grade these.', dealt)).toEqual([])
  })
})

describe('readLane turn outline shapes', () => {
  const entry = { turn: 1, seq: 6, prompt: 'q', response: '$32,765 million' }

  it('reads the answer from the wire view array', () => {
    expect(readLane(undefined, undefined, undefined, [entry], false).answer).toBe('$32,765 million')
  })

  it('reports no answer for a lane that has not answered', () => {
    expect(readLane(undefined, undefined, undefined, { turns: [] }, false).answer).toBeUndefined()
    expect(readLane(undefined, undefined, undefined, undefined, false).answer).toBeUndefined()
  })
})
