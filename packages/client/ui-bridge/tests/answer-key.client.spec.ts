/**
 * Matching an asked question to the benchmark's answer key: the lookup is what
 * removes the typing from a grade, so a wrong match would grade a lane against
 * another question's answer.
 */

import { describe, expect, it } from 'vitest'
import { lookupGold, normalizeQuestion } from '../src/client/answer-key.ts'

const KEY = [
  { question: 'What is the FY2018 capital expenditure amount (in USD millions) for 3M?', gold: '$1577.00' },
  { question: 'Is 3M a capital-intensive business based on FY2022 data?', gold: 'No, the company is managing its CAPEX efficiently' },
]

describe('normalizeQuestion', () => {
  it('keeps the figures a finance question turns on', () => {
    expect(normalizeQuestion('FY2018 capex, in USD millions? 5.1% of $3M'))
      .toBe('fy2018 capex in usd millions 5.1% of $3m')
  })

  it('reads a pasted question and a typed one as the same question', () => {
    expect(normalizeQuestion('  Is 3M a capital-intensive business\n based on FY2022 data?  '))
      .toBe(normalizeQuestion('is 3m a capital intensive business based on fy2022 data'))
  })
})

describe('lookupGold', () => {
  it('finds the answer for the question as the benchmark states it', () => {
    expect(lookupGold(KEY, 'What is the FY2018 capital expenditure amount (in USD millions) for 3M?'))
      .toBe('$1577.00')
  })

  it('finds it through the wrapping a composer paste adds', () => {
    expect(lookupGold(KEY, 'Please answer: Is 3M a capital-intensive business based on FY2022 data? Cite the filing.'))
      .toBe('No, the company is managing its CAPEX efficiently')
  })

  it('answers nothing for a question the key does not hold', () => {
    expect(lookupGold(KEY, 'What was Amazon FY2017 revenue?')).toBeUndefined()
  })

  it('does not match a question that merely appears inside a stored one', () => {
    // A three-word prompt must not claim the answer to a question it is a
    // fragment of: the lanes were not asked that question.
    expect(lookupGold(KEY, 'capital expenditure amount')).toBeUndefined()
  })

  it('prefers the longer of two questions that both fit', () => {
    const key = [
      { question: 'What is 3M capex?', gold: 'short' },
      { question: 'What is 3M capex for FY2018 in USD millions?', gold: 'long' },
    ]
    expect(lookupGold(key, 'Analyst question: What is 3M capex for FY2018 in USD millions? Answer precisely.'))
      .toBe('long')
  })

  it('answers nothing for a blank question or an empty key', () => {
    expect(lookupGold(KEY, '   ')).toBeUndefined()
    expect(lookupGold([], 'What is the FY2018 capital expenditure amount (in USD millions) for 3M?'))
      .toBeUndefined()
  })
})
