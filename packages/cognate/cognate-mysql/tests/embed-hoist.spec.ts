import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Statements the provider issued, in order, so the rewrite can be asserted on the wire. */
const issued: string[] = []

vi.mock('mysql2/promise', () => ({
  createConnection: async () => ({
    query: async (sql: string) => {
      issued.push(sql)
      if (/^SELECT cognitive_embed/i.test(sql)) {
        return [[{ "cognitive_embed('p','m','q')": [0.5, -0.25, 0.125] }], []]
      }
      return [[{ id: 1, score: 0.9 }], [{ name: 'id', type: 3 }, { name: 'score', type: 5 }]]
    },
    end: async () => {},
    destroy: () => {},
  }),
}))

const { MysqlCognateProvider } = await import('../src/index.ts')

function provider() {
  return new MysqlCognateProvider({ host: 'h', port: 9030, user: 'u', password: 'p' })
}

beforeEach(() => { issued.length = 0 })

describe('embedding hoist on the wire', () => {
  it('evaluates the call once and sends the literal the index needs', async () => {
    const sql = "SELECT id, approx_cosine_similarity(vector, cognitive_embed('p','m','q')) AS score"
      + ' FROM b_chunks ORDER BY score DESC LIMIT 5'
    const result = await provider().execute({ sql, kind: 'cognitive', signal: AbortSignal.timeout(5000) })

    expect(issued[0]).toBe("SELECT cognitive_embed('p','m','q')")
    expect(issued[1]).toBe('SELECT id, approx_cosine_similarity(vector, [0.5,-0.25,0.125]) AS score'
      + ' FROM b_chunks ORDER BY score DESC LIMIT 5')
    // The model reads back what it wrote, not ten kilobytes of floats.
    expect(result.sql).toBe(sql)
  })

  it('leaves a bare embedding request alone, since its vector is the answer', async () => {
    await provider().execute({
      sql: "SELECT cognitive_embed('p','m','q')", kind: 'cognitive', signal: AbortSignal.timeout(5000),
    })
    expect(issued).toEqual(["SELECT cognitive_embed('p','m','q')"])
  })

  it('sends an ordinary retrieval statement untouched', async () => {
    const sql = 'SELECT chunk_text FROM b_chunks LIMIT 5'
    await provider().execute({ sql, kind: 'read', signal: AbortSignal.timeout(5000) })
    expect(issued).toEqual([sql])
  })
})
