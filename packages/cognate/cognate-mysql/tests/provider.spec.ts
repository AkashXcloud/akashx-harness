import { describe, expect, it } from 'vitest'
import { MysqlCognateProvider } from '../src/index.ts'

describe('MysqlCognateProvider', () => {
  it('accepts a direct executor for embedded deployments and preserves structured results', async () => {
    const provider = new MysqlCognateProvider({ semanticContext: { database: 'analytics' } }, async (sql, signal) => {
      expect(sql).toBe('SELECT 1')
      expect(signal.aborted).toBe(false)
      return { columns: [{ name: 'answer', type: 'INT' }], rows: [{ answer: 1 }] }
    })
    const result = await provider.execute({ sql: 'SELECT 1', kind: 'read', signal: new AbortController().signal })
    expect(result).toMatchObject({ sql: 'SELECT 1', kind: 'read', externalOperation: false, rows: [{ answer: 1 }] })
    expect(provider.context()).toEqual({ database: 'analytics' })
  })

  it('accepts a configured provider and does not expose URL credentials in context', () => {
    const provider = new MysqlCognateProvider({ url: 'mysql://secret-user:secret-pass@example.test:9030/analytics', semanticContext: { database: 'analytics' } })
    expect(provider.available()).toBe(true)
    expect(JSON.stringify(provider.context())).not.toContain('secret-pass')
    expect(new MysqlCognateProvider({}).available()).toBe(false)
  })

  it('forwards cancellation to an embedded executor', async () => {
    const controller = new AbortController()
    let observed: AbortSignal | undefined
    const provider = new MysqlCognateProvider({}, async (_sql, signal) => {
      observed = signal
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
      throw signal.reason ?? new Error('cancelled')
    })
    const pending = provider.execute({ sql: 'SELECT 1', kind: 'read', signal: controller.signal })
    controller.abort(new Error('cancelled'))
    await expect(pending).rejects.toThrow('cancelled')
    expect(observed?.aborted).toBe(true)
  })

  it('probes capabilities sequentially and reports unsupported statements', async () => {
    const statements: string[] = []
    const provider = new MysqlCognateProvider({}, async (sql) => {
      statements.push(sql)
      if (sql === 'SHOW ONTOLOGY VIEWS') throw new Error('unsupported')
      return { columns: [], rows: [] }
    })
    await expect(provider.probe?.([
      { id: 'basic', sql: 'SELECT 1' },
      { id: 'ontology', sql: 'SHOW ONTOLOGY VIEWS' },
    ], new AbortController().signal)).resolves.toEqual([
      { id: 'basic', supported: true },
      { id: 'ontology', supported: false },
    ])
    expect(statements).toEqual(['SELECT 1', 'SHOW ONTOLOGY VIEWS'])
  })
})
