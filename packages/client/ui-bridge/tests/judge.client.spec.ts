import { describe, expect, it } from 'vitest'
import { dealBlind, judgePrompt, readGrade, readVerdicts } from '../src/client/judge.ts'
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

const KEY = [
  { id: 'fb-1', question: 'What was 3M revenue in FY2018?', gold: '$32,765 million' },
  { id: 'fb-2', question: 'What was 3M capex in FY2018?', gold: '$1577.00' },
]

describe('judgePrompt', () => {
  it('carries the question, every key row and every lettered answer', () => {
    const prompt = judgePrompt('3M revenue 2018?', KEY, dealBlind(ENTRIES, fixed))
    expect(prompt).toContain('3M revenue 2018?')
    expect(prompt).toContain('fb-1 | What was 3M revenue in FY2018? | $32,765 million')
    expect(prompt).toContain('fb-2 | What was 3M capex in FY2018? | $1577.00')
    expect(prompt).toContain('about 1540')
  })

  it('asks the grader to match the question rather than the words', () => {
    // A person asks in their own words and wraps the question in retrieval
    // instructions; a prompt asking for matching text would send them back to
    // typing the answer out.
    const prompt = judgePrompt('q', KEY, dealBlind(ENTRIES, fixed))
    expect(prompt).toMatch(/match on what is\s+being asked/i)
    expect(prompt).toMatch(/reply exactly `Q=none`/i)
  })

  it('numbers a key whose rows carry no id of their own', () => {
    const prompt = judgePrompt('q', [{ question: 'anything?', gold: 'yes' }], dealBlind(ENTRIES, fixed))
    expect(prompt).toContain('row-1 | anything? | yes')
  })

  it('asks for a grade short enough to survive the response preview clip', () => {
    // The host clips a turn's response preview to 120 characters; a reply that
    // spent a line per answer would lose its last verdicts to that clip.
    const prompt = judgePrompt('q', KEY, dealBlind(ENTRIES, fixed))
    expect(prompt).toMatch(/ONE short line/i)
    expect('Q=financebench_id_03029 A=correct B=wrong:says-1540 C=correct'.length).toBeLessThan(120)
  })

  it('forbids the grader looking the answer up for itself', () => {
    expect(judgePrompt('q', KEY, dealBlind(ENTRIES, fixed))).toMatch(/do not run any query/i)
  })

  it('names no lane, so a grade cannot follow the mode', () => {
    expect(judgePrompt('q', KEY, dealBlind(ENTRIES, fixed))).not.toContain('lane-')
  })
})

describe('readGrade', () => {
  const dealt = dealBlind(ENTRIES, fixed)

  it('reports the row the grader matched beside its verdicts', () => {
    const grade = readGrade('Q=fb-2 A=correct B=wrong:says-1540 C=correct', KEY, dealt)
    expect(grade.matched?.gold).toBe('$1577.00')
    expect(grade.verdicts).toHaveLength(3)
  })

  it('marks nothing when the grader matched no question', () => {
    // Every ruling in such a reply was measured against an answer the panel
    // cannot name, which is worse than no grade at all.
    const grade = readGrade('Q=none', KEY, dealt)
    expect(grade.matched).toBeUndefined()
    expect(grade.verdicts).toEqual([])
  })

  it('marks nothing when the grader named a row that is not in the key', () => {
    expect(readGrade('Q=fb-9 A=correct', KEY, dealt).matched).toBeUndefined()
  })

  it('marks nothing when the grader named no row at all', () => {
    expect(readGrade('A=correct B=correct C=correct', KEY, dealt).matched).toBeUndefined()
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
