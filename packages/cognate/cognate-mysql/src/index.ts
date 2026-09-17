/** Direct MySQL-wire provider for AkashXDB and the Cognate service. @module @akashx/akx-cognate-mysql */

import { Context } from '@akashx/cordis'
import z from '@akashx/schemastery'
import { createConnection } from 'mysql2/promise'
import type { JsonValue } from '@akashx/akx-util-values'
import { parseProfileUsage } from '@akashx/akx-cognate'
import type {
  CognateColumn,
  CognateCapabilityProbe,
  CognateProbeResult,
  CognateProvider,
  CognateQueryRequest,
  CognateQueryResult,
  CognateSemanticContext,
  CognateUsage,
} from '@akashx/akx-cognate'
import type {} from '@akashx/akx-cognate'

/** A transport-independent query result used by deterministic provider tests. */
export interface DirectQueryResult {
  readonly columns: readonly CognateColumn[]
  readonly rows: readonly Record<string, JsonValue>[]
  readonly answer?: string
  readonly citations?: CognateQueryResult['citations']
  /** Deployment query id of the executed statement, when the provider captured one. */
  readonly queryId?: string
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
  /** Record the deployment query id of every cognitive statement, so its query profile can
   * be read afterwards. Costs one `SET enable_profile` and one `SELECT last_query_id()` on
   * the statement's own connection, and makes the deployment retain a profile per statement;
   * deployments that do not read profiles should leave it off. */
  readonly captureQueryId?: boolean
  /** Base URL of the deployment's HTTP profile service, e.g. `http://127.0.0.1:8030`. It is a
   * different port, and often a different interface, from the MySQL wire, so it is configured
   * rather than derived from `host`. Without it no query profile is read and `cognitive_ask`
   * reports no spend. The MySQL user and password authenticate the request. */
  readonly profileUrl?: string
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
  captureQueryId: z.boolean().default(false),
  profileUrl: z.string(),
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
    // Only cognitive statements spend deployment tokens, so only they are worth profiling.
    const capture = this.config.captureQueryId === true && request.kind === 'cognitive'
    const result = await this.rawQuery(request.sql, request.signal, capture)
    return {
      sql: request.sql,
      kind: request.kind,
      columns: result.columns,
      rows: result.rows,
      ...result.answer !== undefined ? { answer: result.answer } : {},
      citations: result.citations ?? [],
      ...result.queryId !== undefined ? { queryId: result.queryId } : {},
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

  /** Read one statement's spend from the deployment's profile service.
   * @param queryId - deployment query id captured when the statement ran.
   * @param signal - cancellation signal for the lookup.
   * @returns usage when the profile carries cognitive counters.
   */
  async usage(queryId: string, signal: AbortSignal): Promise<CognateUsage | undefined> {
    const base = this.config.profileUrl
    if (base === undefined || this.options === undefined) return undefined
    try {
      const url = new URL('/api/profile', base)
      url.searchParams.set('query_id', queryId)
      const credentials = `${this.options.user}:${this.options.password}`
      const response = await fetch(url, {
        signal,
        headers: { authorization: `Basic ${Buffer.from(credentials).toString('base64')}` },
      })
      if (!response.ok) return undefined
      return parseProfileUsage(await response.text())
    } catch {
      // The statement has already returned its rows; losing only its profile must not fail it.
      return undefined
    }
  }

  private async rawQuery(sql: string, signal: AbortSignal, captureQueryId = false): Promise<DirectQueryResult> {
    if (this.directExecutor !== undefined) return this.directExecutor(sql, signal)
    return this.queryMySql(sql, signal, captureQueryId)
  }

  private async queryMySql(sql: string, signal: AbortSignal, captureQueryId: boolean): Promise<DirectQueryResult> {
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
      // Profiling is a session variable and the id names the LAST statement, so both rides
      // must share this connection with the statement they describe.
      if (captureQueryId) await connection.query('SET enable_profile = true')
      const query = connection.query(sql)
      if (timeout !== undefined) timer = setTimeout(() => { connection.destroy() }, timeout)
      const [rows, fields] = await query
      if (signal.aborted) throw signal.reason ?? new Error('Cognate SQL was cancelled')
      const queryId = captureQueryId ? await lastQueryId(connection) : undefined
      return {
        columns: fields.map(field => ({ name: field.name, type: String(field.type) })),
        rows: Array.isArray(rows) ? rows.map(row => normalizeRow(row)) : [],
        ...queryId !== undefined ? { queryId } : {},
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

/** Read the deployment id of the statement that just ran on this connection.
 *
 * The id is returned under a function-call column name, so the value is taken positionally
 * rather than by key. A deployment that does not implement `last_query_id()` yields no id
 * instead of failing the statement that already succeeded.
 *
 * @param connection - the connection the described statement ran on.
 * @returns the query id, or undefined when the deployment reported none.
 */
async function lastQueryId(connection: { query(sql: string): Promise<unknown> }): Promise<string | undefined> {
  try {
    const result = await connection.query('SELECT last_query_id()')
    const rows: unknown = Array.isArray(result) ? result[0] : undefined
    const row: unknown = Array.isArray(rows) ? rows[0] : undefined
    if (typeof row !== 'object' || row === null) return undefined
    const value: unknown = Object.values(row)[0]
    return typeof value === 'string' && value !== '' ? value : undefined
  } catch {
    // The statement itself has already returned; losing only its id must not fail the call.
    return undefined
  }
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
