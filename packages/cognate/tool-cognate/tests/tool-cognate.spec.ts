import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import CognateRuntime, { type CognateProvider } from '@deepseek-ai/dsh-cognate'
import * as toolCognate from '../src/index.ts'

let tempRoot: string | undefined
let loadedContext: Context | undefined
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  await loadedContext?.fiber.dispose()
  loadedContext = undefined
  if (tempRoot !== undefined) await rm(tempRoot, { recursive: true, force: true })
  tempRoot = undefined
})

const signal = new AbortController().signal

function provider(overrides: Partial<CognateProvider> = {}): CognateProvider {
  return {
    id: 'fake',
    available: () => true,
    context: () => ({
      dialect: 'starrocks',
      database: 'analytics',
      tables: ['sales'],
      ontologyViews: ['invoice_ontology'],
      ragBuckets: ['company_docs'],
      conceptTrees: [{ source: 'company_docs_raw_files', enabled: true, domain: 'FINANCE' }],
    }),
    execute: async request => ({
      sql: request.sql,
      kind: request.kind,
      columns: [{ name: 'region', type: 'VARCHAR' }, { name: 'revenue', type: 'DOUBLE' }],
      rows: [{ region: 'East', revenue: 10 }],
      citations: [],
      externalOperation: request.kind === 'cognitive',
    }),
    ...overrides,
  }
}

async function setup(config: { allowExternalOperations?: boolean } = {}, selectedProvider = provider()): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(CognateRuntime, { provider: 'fake', ...config })
  ctx.cognate.registerProvider(selectedProvider)
  await ctx.plugin(toolCognate)
  contexts.push(ctx)
  return ctx
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text ?? '').join('')
}

describe('Cognate tools', () => {
  it('registers run_sql and render_chart and injects semantic context', async () => {
    const ctx = await setup()
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(expect.arrayContaining(['run_sql', 'render_chart']))
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.find(section => section.name === 'tool:cognate')?.text).toContain('Use run_sql')
    expect(assembly.contexts.find(context => context.name === 'cognate:semantic-context')?.text).toContain('company_docs')
    expect(assembly.contexts.find(context => context.name === 'cognate:semantic-context')?.text).toContain('company_docs_raw_files')
  })

  it('includes provider readiness in the model prompt', async () => {
    const ctx = await setup({}, provider({ available: () => false, availabilityReason: () => 'set AKASHXDB_URL' }))
    const assembly = await ctx.systemPrompt.assemble()
    expect(assembly.sections.find(section => section.name === 'tool:cognate')?.text).toContain('set AKASHXDB_URL')
  })

  it('executes a read through the native tool pipeline and preserves bounds metadata', async () => {
    const ctx = await setup()
    const result = await ctx.tools.execute({ signal, callId: ToolCallId('sql-1'), name: 'run_sql', arguments: { sql: 'SELECT * FROM sales' } })
    expect(result.isError).toBe(false)
    expect(text(result)).toContain('"row_count": 1')
    expect(result.value).toMatchObject({ kind: 'read', external_operation: false, truncated: false })
  })

  it('supports sequential data and knowledge calls without mixing their citations', async () => {
    const ctx = await setup({ allowExternalOperations: true }, provider({
      execute: async request => ({
        sql: request.sql,
        kind: request.kind,
        columns: request.kind === 'read' ? [{ name: 'revenue' }] : [],
        rows: request.kind === 'read' ? [{ revenue: 10 }] : [],
        ...request.kind === 'cognitive'
          ? { answer: 'The policy says revenue is recognized on delivery.', citations: [{ document: 'policy.md', page: 4 }] }
          : { citations: [] },
        externalOperation: request.kind === 'cognitive',
      }),
    }))
    const data = await ctx.tools.execute({ signal, callId: ToolCallId('data-1'), name: 'run_sql', arguments: { sql: 'SELECT revenue FROM sales' } })
    const knowledge = await ctx.tools.execute({ signal, callId: ToolCallId('knowledge-1'), name: 'run_sql', arguments: { sql: "ASK 'recognition' ON company_docs" } })
    expect(data.isError).toBe(false)
    expect(knowledge.isError).toBe(false)
    expect(data.value).toMatchObject({ kind: 'read', citations: [], rows: [{ revenue: 10 }] })
    expect(knowledge.value).toMatchObject({ kind: 'cognitive', answer: 'The policy says revenue is recognized on delivery.', citations: [{ document: 'policy.md', page: 4 }] })
  })

  it('keeps external cognitive SQL behind explicit policy', async () => {
    const denied = await (await setup()).tools.execute({ signal, callId: ToolCallId('ask-denied'), name: 'run_sql', arguments: { sql: "ASK 'x' ON company_docs" } })
    expect(denied.isError).toBe(true)
    expect(text(denied)).toContain('external SQL operations are disabled')
    const allowed = await (await setup({ allowExternalOperations: true })).tools.execute({ signal, callId: ToolCallId('ask-allowed'), name: 'run_sql', arguments: { sql: "ASK 'x' ON company_docs" } })
    expect(allowed.isError).toBe(false)
    expect(allowed.value).toMatchObject({ kind: 'cognitive', external_operation: true })
  })

  it('renders a chart without invoking the Cognate provider', async () => {
    let calls = 0
    const ctx = await setup({}, provider({ execute: async (request) => { calls += 1; return provider().execute(request) } }))
    const result = await ctx.tools.execute({
      signal,
      callId: ToolCallId('chart-1'),
      name: 'render_chart',
      arguments: {
        type: 'bar', label_column: 'region', value_columns: ['revenue'],
        columns: ['region', 'revenue'], rows: [{ region: 'East', revenue: 10 }], title: 'Revenue',
      },
    })
    expect(result.isError).toBe(false)
    expect(calls).toBe(0)
    expect(result.value).toMatchObject({ type: 'bar', label_column: 'region', value_columns: ['revenue'] })
  })

  it('rejects malformed chart data before any provider call', async () => {
    const ctx = await setup()
    const result = await ctx.tools.execute({
      signal,
      callId: ToolCallId('chart-invalid'),
      name: 'render_chart',
      arguments: {
        type: 'line', label_column: 'region', value_columns: ['revenue'],
        columns: ['region', 'revenue'], rows: [{ region: 'East', revenue: 'ten' }],
      },
    })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('must contain numbers or null')
  })

  it('boots the service and tools through a real Loader composition', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'dsh-cognate-loader-'))
    const configPath = join(tempRoot, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-system-prompt'",
      "- name: '@deepseek-ai/dsh-tools'",
      "- name: '@deepseek-ai/dsh-cognate'",
      '  config:',
      '    provider: fake',
      "- name: '@deepseek-ai/dsh-tool-cognate'",
      '',
    ].join('\n'))
    const ctx = new Context()
    loadedContext = ctx
    ctx.baseUrl = pathToFileURL(tempRoot).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        const modules = new Map<string, unknown>([
          ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
          ['@deepseek-ai/dsh-tools', ToolRuntime],
          ['@deepseek-ai/dsh-cognate', CognateRuntime],
          ['@deepseek-ai/dsh-tool-cognate', toolCognate],
        ])
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    ctx.cognate.registerProvider(provider())
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(expect.arrayContaining(['run_sql', 'render_chart']))
    const result = await ctx.tools.execute({ signal, callId: ToolCallId('loader-sql'), name: 'run_sql', arguments: { sql: 'SELECT 1' } })
    expect(result.isError).toBe(false)
  })
})
