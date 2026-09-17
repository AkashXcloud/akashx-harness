import { describe, expect, it } from 'vitest'
import { findEmbedCalls, shouldHoistEmbeddings, spliceEmbeddings, vectorFromRow } from '../src/index.ts'

const RETRIEVAL = "SELECT id, approx_cosine_similarity(vector, cognitive_embed('foundry', 'm', 'revenue')) AS s"
  + ' FROM financebench.b_chunks ORDER BY s DESC LIMIT 5'

describe('shouldHoistEmbeddings', () => {
  it('hoists for a statement that reads a table', () => {
    expect(shouldHoistEmbeddings(RETRIEVAL)).toBe(true)
  })

  it('leaves a bare embedding request alone, since the vector is the answer', () => {
    expect(shouldHoistEmbeddings("SELECT cognitive_embed('foundry', 'm', 'revenue')")).toBe(false)
  })

  it('ignores the word FROM inside a literal or comment', () => {
    expect(shouldHoistEmbeddings("SELECT cognitive_embed('foundry', 'm', 'notes from 2018')")).toBe(false)
    expect(shouldHoistEmbeddings("SELECT cognitive_embed('foundry', 'm', 'q') -- FROM chunks")).toBe(false)
  })
})

describe('findEmbedCalls', () => {
  it('locates the call and keeps its source verbatim', () => {
    const calls = findEmbedCalls(RETRIEVAL)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.expression).toBe("cognitive_embed('foundry', 'm', 'revenue')")
    expect(RETRIEVAL.slice(calls[0]!.start, calls[0]!.end)).toBe(calls[0]?.expression)
  })

  it('does not mistake a call named inside a string or comment for one to evaluate', () => {
    expect(findEmbedCalls("SELECT a FROM t WHERE note = 'cognitive_embed(x)'")).toEqual([])
    expect(findEmbedCalls('SELECT a FROM t -- cognitive_embed(x)\n')).toEqual([])
  })

  it('balances parentheses that appear inside a string argument', () => {
    const sql = "SELECT approx_cosine_similarity(v, cognitive_embed('p', 'm', 'net sales (total)')) FROM t"
    const calls = findEmbedCalls(sql)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.expression).toBe("cognitive_embed('p', 'm', 'net sales (total)')")
  })

  it('finds every call in source order', () => {
    const sql = "SELECT cognitive_embed('p','m','a'), cognitive_embed('p','m','b') FROM t"
    expect(findEmbedCalls(sql).map(call => call.expression)).toEqual([
      "cognitive_embed('p','m','a')",
      "cognitive_embed('p','m','b')",
    ])
  })

  it('skips an unbalanced call rather than guessing where it ends', () => {
    expect(findEmbedCalls("SELECT cognitive_embed('p','m','q' FROM t")).toEqual([])
  })
})

describe('spliceEmbeddings', () => {
  it('replaces the call with the array literal the index needs', () => {
    const calls = findEmbedCalls(RETRIEVAL)
    expect(spliceEmbeddings(RETRIEVAL, calls, [[0.5, -0.25, 0]]))
      .toBe('SELECT id, approx_cosine_similarity(vector, [0.5,-0.25,0]) AS s'
        + ' FROM financebench.b_chunks ORDER BY s DESC LIMIT 5')
  })

  it('replaces several calls without disturbing the text between them', () => {
    const sql = "SELECT cognitive_embed('p','m','a'), cognitive_embed('p','m','b') FROM t"
    expect(spliceEmbeddings(sql, findEmbedCalls(sql), [[1], [2, 3]]))
      .toBe('SELECT [1], [2,3] FROM t')
  })

  it('refuses a count mismatch rather than pairing a vector with the wrong call', () => {
    expect(() => spliceEmbeddings(RETRIEVAL, findEmbedCalls(RETRIEVAL), []))
      .toThrow('expected 1 vectors, received 0')
  })
})

describe('vectorFromRow', () => {
  it('reads the vector positionally, whatever the column is called', () => {
    expect(vectorFromRow({ "cognitive_embed('p', 'm', 'q')": [0.5, -0.25] })).toEqual([0.5, -0.25])
  })

  it('parses the bracketed text a deployment may return instead of an array', () => {
    expect(vectorFromRow({ v: '[0.5, -0.25, 3e-4]' })).toEqual([0.5, -0.25, 3e-4])
  })

  it('reports nothing usable rather than a vector with holes in it', () => {
    expect(vectorFromRow(undefined)).toBeUndefined()
    expect(vectorFromRow({ v: null })).toBeUndefined()
    expect(vectorFromRow({ v: '[0.5, oops]' })).toBeUndefined()
    expect(vectorFromRow({ v: 'not a vector' })).toBeUndefined()
  })
})
