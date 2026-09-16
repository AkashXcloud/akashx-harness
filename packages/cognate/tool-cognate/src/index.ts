/** Model-facing Cognate SQL and deterministic chart tools. @module @akashx/akx-tool-cognate */

import type { Context } from '@akashx/cordis'
import z from '@akashx/schemastery'
import type { CognateQueryResult, CognateSemanticContext } from '@akashx/akx-cognate'
import type {} from '@akashx/akx-cognate'
import { defineTool } from '@akashx/akx-tools'
import type { JsonValue } from '@akashx/akx-util-values'

/** Cordis plugin name. */
export const name = 'tool-cognate'

/** Services required by the Cognate model-facing tools. */
export const inject = ['tools', 'systemPrompt', 'cognate']

/** Tool configuration for bounded prompt context and chart points. */
export interface Config {
  /** Maximum characters emitted by the semantic-context prompt contribution. */
  readonly contextMaxChars?: number
  /** Maximum rows accepted by render_chart. */
  readonly maxChartPoints?: number
}

export const Config: z<Config> = z.object({
  contextMaxChars: z.number().default(16_000),
  maxChartPoints: z.number().default(500),
})

const QUERY_OUTPUT_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    sql: { type: 'string' as const, required: true as const },
    kind: { type: 'string' as const, required: true as const },
    columns: {
      type: 'array' as const,
      required: true as const,
      items: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          name: { type: 'string' as const, required: true as const },
          type: { type: 'string' as const },
        },
      },
    },
    rows: { type: 'array' as const, required: true as const, items: { type: 'json' as const } },
    row_count: { type: 'integer' as const, required: true as const },
    truncated: { type: 'boolean' as const, required: true as const },
    external_operation: { type: 'boolean' as const, required: true as const },
    answer: { type: 'string' as const },
    citations: { type: 'array' as const, required: true as const, items: { type: 'json' as const } },
    query_id: { type: 'string' as const },
  },
} as const

const CHART_OUTPUT_SCHEMA = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    type: { type: 'string' as const, required: true as const },
    title: { type: 'string' as const },
    label_column: { type: 'string' as const, required: true as const },
    value_columns: { type: 'array' as const, required: true as const, items: { type: 'string' as const } },
    columns: { type: 'array' as const, required: true as const, items: { type: 'json' as const } },
    rows: { type: 'array' as const, required: true as const, items: { type: 'json' as const } },
  },
} as const

interface QueryToolValue {
  readonly sql: string
  readonly kind: string
  readonly columns: { readonly name: string; readonly type?: string }[]
  readonly rows: JsonValue[]
  readonly row_count: number
  readonly truncated: boolean
  readonly external_operation: boolean
  readonly answer?: string
  readonly citations: JsonValue[]
  readonly query_id?: string
}

interface ChartToolValue {
  readonly type: string
  readonly title?: string
  readonly label_column: string
  readonly value_columns: string[]
  readonly columns: JsonValue[]
  readonly rows: JsonValue[]
}

/** Register `run_sql` and the SQL-independent `render_chart` tool. */
export function apply(ctx: Context, config: Config): void {
  const contextMaxChars = config.contextMaxChars ?? 16_000
  const maxChartPoints = config.maxChartPoints ?? 500
  assertPositiveInteger('contextMaxChars', contextMaxChars)
  assertPositiveInteger('maxChartPoints', maxChartPoints)

  ctx.systemPrompt.section({
    name: 'tool:cognate',
    order: ctx.systemPrompt.getSectionOrder('TOOL_COGNATE'),
    text: () => `Cognate provider status: ${providerStatus(ctx)} Use run_sql for AkashXDB tables, ontology views, RagBucket ASK statements, and approved cognitive SQL. Use ontology views for structured extraction and filter completed rows with status = 'done'. Use ASK only with a known RagBucket. Use render_chart with explicitly supplied tabular data; it never runs SQL and does not require run_sql. Use Bash for local process and filesystem work. Never invent tables, columns, buckets, credentials, or citations.`,
  })
  ctx.systemPrompt.context({
    name: 'cognate:semantic-context',
    order: ctx.systemPrompt.getContextOrder('COGNATE_SEMANTIC_CONTEXT'),
    text: () => renderContext(ctx.cognate.context(), contextMaxChars),
  })

  ctx.tools.register(defineTool({
    name: 'run_sql',
    description: 'Run one bounded, policy-checked SQL statement against the configured AkashXDB semantic model. Returns rows, metadata, answers, and citations.',
    parameters: {
      sql: { type: 'string', required: true, description: 'One SQL, SHOW, DESCRIBE, or approved AkashX cognitive statement.' },
    },
    output: {
      schema: QUERY_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    execute: async (args, exec) => normalizeQueryResult(await ctx.cognate.execute({ sql: args.sql, signal: exec.signal })),
    presentCall: args => ({ card: 'generic', title: 'Run SQL', kind: 'read', rawInput: args.sql }),
  }))

  ctx.tools.register(defineTool({
    name: 'render_chart',
    description: 'Create deterministic chart presentation metadata from explicitly supplied tabular data. This tool never executes SQL and does not require run_sql.',
    parameters: {
      type: { type: 'string', required: true, enum: ['bar', 'line', 'area', 'pie', 'scatter'] },
      label_column: { type: 'string', required: true },
      value_columns: { type: 'array', required: true, items: { type: 'string' } },
      columns: { type: 'array', required: true, items: { type: 'json' } },
      rows: { type: 'array', required: true, items: { type: 'json' } },
      title: { type: 'string' },
    },
    output: {
      schema: CHART_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      presentationMeta: (_args, value) => value,
    },
    execute: args => Promise.resolve(createChart(args, maxChartPoints)),
    presentCall: () => ({ card: 'generic', title: 'Render chart', kind: 'read' }),
  }))
}

function normalizeQueryResult(result: CognateQueryResult): QueryToolValue {
  return {
    sql: result.sql,
    kind: result.kind,
    columns: result.columns.map(column => ({ ...column })),
    rows: result.rows.map(row => ({ ...row })),
    row_count: result.rows.length,
    truncated: result.truncated === true,
    external_operation: result.externalOperation,
    ...result.answer !== undefined ? { answer: result.answer } : {},
    citations: result.citations.map(normalizeCitation),
    ...result.queryId !== undefined ? { query_id: result.queryId } : {},
  }
}

function normalizeCitation(citation: CognateQueryResult['citations'][number]): JsonValue {
  const value: Record<string, JsonValue> = {}
  if (citation.sourceIndex !== undefined) value.sourceIndex = citation.sourceIndex
  if (citation.documentId !== undefined) value.documentId = citation.documentId
  if (citation.knowledgeBaseId !== undefined) value.knowledgeBaseId = citation.knowledgeBaseId
  if (citation.document !== undefined) value.document = citation.document
  if (citation.page !== undefined) value.page = citation.page
  if (citation.text !== undefined) value.text = citation.text
  if (citation.start !== undefined) value.start = citation.start
  if (citation.end !== undefined) value.end = citation.end
  if (citation.nodePath !== undefined) value.nodePath = [...citation.nodePath]
  if (citation.confidence !== undefined) value.confidence = citation.confidence
  if (citation.verified !== undefined) value.verified = citation.verified
  return value
}

function renderContext(context: CognateSemanticContext | undefined, maxChars: number): string {
  if (context === undefined) return ''
  const text = JSON.stringify({ cognate_context: context }, null, 2)
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n[context truncated]`
}

function providerStatus(ctx: Context): string {
  const status = ctx.cognate.availability()
  if (status.available) return `The configured provider "${status.provider ?? 'selected'}" is available.`
  return `No Cognate query is available (${status.reason ?? 'provider unavailable'}). Do not claim that database-backed work succeeded; ask the user to configure the Cognate provider or use local tools.`
}

function createChart(args: {
  readonly type: string
  readonly label_column: string
  readonly value_columns: readonly string[]
  readonly columns: readonly JsonValue[]
  readonly rows: readonly JsonValue[]
  readonly title?: string
}, maxPoints: number): ChartToolValue {
  if (!['bar', 'line', 'area', 'pie', 'scatter'].includes(args.type)) throw new Error(`unsupported chart type "${args.type}"`)
  if (args.value_columns.length === 0) throw new Error('render_chart requires at least one value column')
  const columns = args.columns.map((column) => {
    if (typeof column !== 'string') throw new Error('chart columns must be strings')
    return column
  })
  if (!columns.includes(args.label_column)) throw new Error(`chart label column "${args.label_column}" is absent from the data`)
  for (const column of args.value_columns) if (!columns.includes(column)) throw new Error(`chart value column "${column}" is absent from the data`)
  if (args.rows.length > maxPoints) throw new Error(`chart data exceeds the ${maxPoints} point limit`)
  const rows = args.rows.map((row) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) throw new Error('chart rows must be objects')
    const object = row as Record<string, JsonValue>
    for (const column of args.value_columns) {
      const value = object[column]
      if (typeof value !== 'number' && value !== null) throw new Error(`chart value column "${column}" must contain numbers or null`)
    }
    return object
  })
  return {
    type: args.type,
    ...args.title !== undefined ? { title: args.title } : {},
    label_column: args.label_column,
    value_columns: [...args.value_columns],
    columns: [...args.columns],
    rows,
  }
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`tool-cognate: ${name} must be a positive safe integer`)
}
