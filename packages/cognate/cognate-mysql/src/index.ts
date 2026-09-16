/** Direct MySQL-wire provider for AkashXDB and the Cognate service. @module @akashx/akx-cognate-mysql */

import { Context } from '@akashx/cordis'
import z from '@akashx/schemastery'
import { createConnection } from 'mysql2/promise'
import type { JsonValue } from '@akashx/akx-util-values'
import type {
  CognateColumn,
  CognateCapabilityProbe,
  CognateProbeResult,
  CognateProvider,
  CognateQueryRequest,
  CognateQueryResult,
  CognateSemanticContext,
} from '@akashx/akx-cognate'
import type {} from '@akashx/akx-cognate'

/** A transport-independent query result used by deterministic provider tests. */
export interface DirectQueryResult {
  readonly columns: readonly CognateColumn[]
  readonly rows: readonly Record<string, JsonValue>[]
  readonly answer?: string
  readonly citations?: CognateQueryResult['citations']
}

/** Optional query override used by host tests and embedded deployments. */
export type DirectQueryExecutor = (sql: string, signal: AbortSignal) => Promise<DirectQueryResult>

/** Direct provider configuration; credentials are never included in context or results. */
export interface Config {
  /** MySQL or MariaDB connection URL. */
  readonly url?: string
  /** Database host when `url` is omitted. */
  readonly host?: string
  /** MySQL wire port; AkashXDB deployments commonly remap this value. */
  readonly port?: number
  /** Database user when `url` is omitted. */
  readonly user?: string
  /** Database password when `url` is omitted; never model-visible. */
  readonly password?: string
  /** Default database when `url` is omitted. */
  readonly database?: string
  /** Provider-side query timeout in milliseconds. */
  readonly queryTimeoutMs?: number
  /** Bounded semantic model supplied to the prompt consumer. */
  readonly semanticContext?: CognateSemanticContext
}

export const Config: z<Config> = z.object({
  url: z.string(),
  host: z.string(),
  port: z.number().default(9030),
  user: z.string(),
  password: z.string(),
  database: z.string(),
  queryTimeoutMs: z.number().default(120_000),
  semanticContext: z.any(),
})

/** Cordis plugin name. */
export const name = 'cognate-mysql'

/** The provider registers into the Cognate service. */
export const inject = ['cognate']

/** MySQL-wire AkashXDB provider with cooperative connection cancellation. */
export class MysqlCognateProvider implements CognateProvider {
  readonly id = 'mysql'
  private readonly options: { host: string; port: number; user: string; password: string; database?: string } | undefined

  constructor(private readonly config: Config, private readonly directExecutor?: DirectQueryExecutor) {
    this.options = connectionOptions(config)
    if (config.queryTimeoutMs !== undefined && (!Number.isSafeInteger(config.queryTimeoutMs) || config.queryTimeoutMs < 1)) {
      throw new Error('cognate-mysql: queryTimeoutMs must be a positive safe integer')
    }
  }

  available(): boolean {
    return this.directExecutor !== undefined || this.options !== undefined
  }

  /** Explain the missing deployment setting without exposing credentials. */
  availabilityReason(): string | undefined {
    if (this.available()) return undefined
    return 'set AKASHXDB_URL or provide host, user, and password in the cognate-mysql configuration'
  }

  context(): CognateSemanticContext | undefined {
    return this.config.semanticContext
  }

  async execute(request: CognateQueryRequest): Promise<CognateQueryResult> {
    const result = await this.rawQuery(request.sql, request.signal)
    return {
      sql: request.sql,
      kind: request.kind,
      columns: result.columns,
      rows: result.rows,
      ...result.answer !== undefined ? { answer: result.answer } : {},
      citations: result.citations ?? [],
      externalOperation: request.kind === 'cognitive',
    }
  }

  /** Probe named deployment capabilities without exposing provider errors to callers.
   * @param probes - validated probe statements supplied by the Cognate service.
   * @param signal - cancellation signal for the whole probe operation.
   * @returns support outcome for each requested capability.
   */
  async probe(probes: readonly CognateCapabilityProbe[], signal: AbortSignal): Promise<readonly CognateProbeResult[]> {
    const results: CognateProbeResult[] = []
    for (const probe of probes) {
      signal.throwIfAborted()
      try {
        await this.rawQuery(probe.sql, signal)
        results.push({ id: probe.id, supported: true })
      } catch {
        if (signal.aborted) throw signal.reason ?? new Error('Cognate capability probe was cancelled')
        results.push({ id: probe.id, supported: false })
      }
    }
    return results
  }

  private async rawQuery(sql: string, signal: AbortSignal): Promise<DirectQueryResult> {
    if (this.directExecutor !== undefined) return this.directExecutor(sql, signal)
    return this.queryMySql(sql, signal)
  }

  private async queryMySql(sql: string, signal: AbortSignal): Promise<DirectQueryResult> {
    if (this.options === undefined) throw new Error('cognate-mysql: no connection is configured')
    signal.throwIfAborted()
    const connection = await createConnection(this.options)
    let timer: ReturnType<typeof setTimeout> | undefined
    const abort = () => {
      connection.destroy()
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      const timeout = this.config.queryTimeoutMs
      const query = connection.query(sql)
      if (timeout !== undefined) timer = setTimeout(() => { connection.destroy() }, timeout)
      const [rows, fields] = await query
      if (signal.aborted) throw signal.reason ?? new Error('Cognate SQL was cancelled')
      return {
        columns: fields.map(field => ({ name: field.name, type: String(field.type) })),
        rows: Array.isArray(rows) ? rows.map(row => normalizeRow(row)) : [],
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      await connection.end().catch(() => {})
    }
  }
}

/** Register the configured provider in the host Cognate service. */
export function apply(ctx: Context, config: Config): void {
  ctx.cognate.registerProvider(new MysqlCognateProvider(config))
}

function connectionOptions(config: Config): { host: string; port: number; user: string; password: string; database?: string } | undefined {
  if (config.url !== undefined && config.url.length > 0) {
    const url = new URL(config.url)
    if (url.protocol !== 'mysql:' && url.protocol !== 'mariadb:') throw new Error(`cognate-mysql: unsupported URL protocol ${url.protocol}`)
    return {
      host: url.hostname,
      port: Number(url.port || config.port || 9030),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ...url.pathname.slice(1) ? { database: decodeURIComponent(url.pathname.slice(1)) } : {},
    }
  }
  if (config.host === undefined || config.user === undefined || config.password === undefined) return undefined
  return {
    host: config.host,
    port: config.port ?? 9030,
    user: config.user,
    password: config.password,
    ...config.database !== undefined ? { database: config.database } : {},
  }
}

function normalizeRow(value: unknown): Record<string, JsonValue> {
  if (typeof value !== 'object' || value === null) return { value: normalizeJson(value) }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeJson(item)]))
}

function normalizeJson(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return value.toString('base64')
  if (Array.isArray(value)) return value.map(item => normalizeJson(item))
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeJson(item)]))
  return typeof value === 'bigint' ? value.toString() : JSON.stringify(value)
}
