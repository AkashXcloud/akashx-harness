import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import CognateRuntime, { type CognateProvider } from '../src/index.ts'

let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
})

function provider(rows: readonly Record<string, string>[]): CognateProvider {
  return {
    id: 'fixture',
    available: () => true,
    context: () => ({ database: 'analytics' }),
    execute: async request => ({
      sql: request.sql,
      kind: request.kind,
      columns: [{ name: 'value', type: 'VARCHAR' }],
      rows,
      citations: [],
      externalOperation: false,
    }),
  }
}

describe('CognateRuntime', () => {
  it('caps rows and marks the result as truncated', async () => {
    ctx = new Context()
    await ctx.plugin(CognateRuntime, { provider: 'fixture', maxRows: 2 })
    ctx.cognate.registerProvider(provider([{ value: 'one' }, { value: 'two' }, { value: 'three' }]))
    const result = await ctx.cognate.execute({ sql: 'SELECT value FROM values', signal: new AbortController().signal })
    expect(result.rows).toEqual([{ value: 'one' }, { value: 'two' }])
    expect(result.truncated).toBe(true)
  })

  it('removes a provider when its registration disposer runs', async () => {
    ctx = new Context()
    await ctx.plugin(CognateRuntime, { provider: 'fixture' })
    const dispose = ctx.cognate.registerProvider(provider([{ value: 'one' }]))
    dispose()
    await expect(ctx.cognate.execute({ sql: 'SELECT value FROM values', signal: new AbortController().signal })).rejects.toThrow('not registered')
  })

  it('reports an actionable reason for an unavailable selected provider', async () => {
    ctx = new Context()
    await ctx.plugin(CognateRuntime, { provider: 'fixture' })
    ctx.cognate.registerProvider({
      ...provider([]),
      available: () => false,
      availabilityReason: () => 'set AKASHXDB_URL',
    })
    expect(ctx.cognate.availability()).toEqual({ provider: 'fixture', available: false, reason: 'set AKASHXDB_URL' })
    await expect(ctx.cognate.execute({ sql: 'SELECT 1', signal: new AbortController().signal })).rejects.toThrow('set AKASHXDB_URL')
  })

  it('rejects a result whose metadata alone exceeds the byte bound', async () => {
    ctx = new Context()
    await ctx.plugin(CognateRuntime, { provider: 'fixture', maxBytes: 10 })
    ctx.cognate.registerProvider(provider([]))
    await expect(ctx.cognate.execute({ sql: 'SELECT value FROM values', signal: new AbortController().signal })).rejects.toThrow('byte limit')
  })

  it('validates and delegates host capability probes without adding another model tool', async () => {
    ctx = new Context()
    await ctx.plugin(CognateRuntime, { provider: 'fixture', allowExternalOperations: true })
    const statements: string[] = []
    ctx.cognate.registerProvider({
      ...provider([]),
      probe: async (probes) => {
        statements.push(...probes.map(probe => probe.sql))
        return probes.map(probe => ({ id: probe.id, supported: probe.sql !== 'SHOW ONTOLOGY VIEWS' }))
      },
    })
    const result = await ctx.cognate.probe([
      { id: 'basic', sql: 'SELECT 1', required: true },
      { id: 'ontology', sql: 'SHOW ONTOLOGY VIEWS' },
      { id: 'ragbucket', sql: "ASK 'x' ON docs" },
      { id: 'concept-tree', sql: "SELECT cognitive_ask(raw_text, 'x', concept_tree) FROM docs_raw_files" },
    ], new AbortController().signal)
    expect(result).toEqual([
      { id: 'basic', supported: true },
      { id: 'ontology', supported: false },
      { id: 'ragbucket', supported: true },
      { id: 'concept-tree', supported: true },
    ])
    expect(statements).toEqual(['SELECT 1', 'SHOW ONTOLOGY VIEWS', "ASK 'x' ON docs", "SELECT cognitive_ask(raw_text, 'x', concept_tree) FROM docs_raw_files"])
    await expect(ctx.cognate.probe([{ id: 'required-ontology', sql: 'SHOW ONTOLOGY VIEWS', required: true }], new AbortController().signal)).rejects.toThrow('required Cognate capabilities')
  })
})
