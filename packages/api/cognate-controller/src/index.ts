/**
 * Host Remote owner for the Cognate database settings surface.
 *
 * The Settings page needs facts only the Host can establish: whether a connection
 * URL is configured, whether the server answers, and what databases and semantic
 * assets that server exposes. Exposing them through a generated Remote keeps the
 * connection string and its credentials on the Host — every returned field is a
 * name, count, or readiness flag, never a secret.
 *
 * The service reads the deployment's connection setting through the same
 * `AKASHXDB_URL` convention the Cognate MySQL provider uses, so one environment
 * variable configures both the model-facing query path and this status surface.
 *
 * @module @deepseek-ai/dsh-api-cognate-controller
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createConnection } from 'mysql2/promise'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type {
  CognateAssetGroup,
  CognateDatabaseChoice,
  CognateDatabaseSelection,
  CognateDatabaseStatus,
} from './types.ts'

export type * from './types.ts'

/** Connection URL variable shared with the Cognate MySQL provider. */
const CONNECTION_URL_VARIABLE = 'AKASHXDB_URL'

/** Views the FinanceBench-oriented deployments expose for ontology queries. */
const ONTOLOGY_VIEW_PREFIX = 'fb_ov_'

/** Bound on how many member names one asset group reports to the browser. */
const MAX_MEMBERS = 500

/** Minimal shape of the MySQL client this service needs, injectable for tests. */
export interface DatabaseProbe {
  /**
   * List databases visible to the configured user.
   * @returns database names.
   */
  listDatabases(): Promise<readonly string[]>
  /**
   * List the tables and views of one database with its kind.
   * @param database - database to inspect.
   * @returns one row per relation.
   */
  listRelations(database: string): Promise<readonly { name: string; kind: 'table' | 'view' }[]>
}

/** Probe configuration. */
export interface Config {
  /** MySQL or MariaDB connection URL; falls back to `AKASHXDB_URL`. */
  readonly url?: string
  /** Connect timeout in milliseconds. */
  readonly connectTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  url: z.string(),
  connectTimeoutMs: z.number().default(10_000),
})

/** Cordis plugin name. */
export const name = 'cognate-controller'

/** Read-only metadata probe over the MySQL wire, one short-lived connection per read. */
class MysqlProbe implements DatabaseProbe {
  /**
   * @param resolveUrl - supplies the connection URL at call time.
   * @param timeoutMs - connect timeout for each connection.
   */
  constructor(private readonly resolveUrl: () => string | undefined, private readonly timeoutMs: number) {}

  async listDatabases(): Promise<readonly string[]> {
    const rows = await this.rows('SHOW DATABASES')
    return rows.map(row => nameOf(row[0])).filter(value => value.length > 0)
  }

  async listRelations(database: string): Promise<readonly { name: string; kind: 'table' | 'view' }[]> {
    // `SHOW FULL TABLES` reports the relation kind in its second, generated
    // column, so the row is read positionally. The database reaches the
    // statement through the connection's own default database, which avoids
    // interpolating an identifier into SQL text.
    const rows = await this.rows('SHOW FULL TABLES', database)
    return rows.map(row => ({
      name: nameOf(row[0]),
      kind: nameOf(row[1]).toUpperCase() === 'VIEW' ? 'view' as const : 'table' as const,
    }))
  }

  /** Run one metadata statement and return its rows positionally. */
  private async rows(sql: string, database?: string): Promise<readonly unknown[][]> {
    const url = this.resolveUrl()
    if (url === undefined) throw new Error(`set ${CONNECTION_URL_VARIABLE}`)
    const connection = await createConnection({
      uri: url, connectTimeout: this.timeoutMs, multipleStatements: false,
      ...database === undefined ? {} : { database },
    })
    try {
      const [result] = await connection.query({ sql, rowsAsArray: true })
      return result as unknown[][]
    } finally {
      await connection.end()
    }
  }
}

/** Remote-only service exposing live Cognate database status. */
export class CognateController extends TypertRemoteService {
  static Config = Config

  private probe: DatabaseProbe | undefined

  /**
   * @param ctx - Host context, used to read the deployment's connection setting.
   * @param config - optional connection URL override and connect timeout.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'cognateController')
    this.probe = new MysqlProbe(
      () => (config.url !== undefined && config.url.length > 0 ? config.url : process.env[CONNECTION_URL_VARIABLE]),
      config.connectTimeoutMs ?? 10_000,
    )
  }

  /**
   * Replace the database probe; deployments without a MySQL driver leave it unset.
   * @param probe - the probe to use for subsequent reads.
   */
  registerProbe(probe: DatabaseProbe): void {
    this.probe = probe
  }

  /**
   * Report the connection state and the database roster for the Settings page.
   *
   * A reachable server yields its database list; the configured database also
   * yields that database's semantic assets, split into ordinary relations,
   * ontology views, and document corpora.
   * @returns configuration and reachability facts, without credentials.
   */
  @Remote('status')
  async status(): Promise<CognateDatabaseStatus> {
    const url = readConnectionUrl()
    if (url === undefined) {
      return {
        configured: false,
        reachable: false,
        reason: `set ${CONNECTION_URL_VARIABLE} to connect this deployment to AkashXDB`,
        databases: [],
        assets: [],
      }
    }
    const parsed = parseConnectionUrl(url)
    if (parsed === undefined) {
      return {
        configured: true,
        reachable: false,
        reason: `${CONNECTION_URL_VARIABLE} is not a usable MySQL connection URL`,
        databases: [],
        assets: [],
      }
    }
    const base: Omit<CognateDatabaseStatus, 'databases' | 'assets'> = {
      configured: true,
      reachable: false,
      endpoint: `${parsed.host}:${parsed.port}`,
      user: parsed.user,
      ...(parsed.database === undefined ? {} : { database: parsed.database }),
    }
    const probe = this.probe
    if (probe === undefined) {
      return { ...base, reason: 'this deployment has no database probe mounted', databases: [], assets: [] }
    }
    let databases: readonly string[]
    try {
      databases = await probe.listDatabases()
    } catch (error) {
      return { ...base, reason: describeConnectionFailure(error), databases: [], assets: [] }
    }
    const choices: CognateDatabaseChoice[] = databases.slice(0, MAX_MEMBERS).map(name => ({ name }))
    const selected = parsed.database ?? databases[0]
    if (selected === undefined) {
      return { ...base, reachable: true, databases: choices, assets: [] }
    }
    let assets: CognateAssetGroup[]
    try {
      assets = classifyAssets(await probe.listRelations(selected))
    } catch (error) {
      return { ...base, reachable: true, database: selected, reason: describeConnectionFailure(error), databases: choices, assets: [] }
    }
    return { ...base, reachable: true, database: selected, databases: choices, assets }
  }

  /**
   * Report one chosen database's semantic assets.
   *
   * The selector calls this when the operator picks a different database, so the
   * asset panels always describe the database shown as selected.
   * @param selection - the database to inspect.
   * @returns that database's semantic assets, or an actionable reason.
   */
  @Remote('assets')
  async assets(selection: CognateDatabaseSelection): Promise<CognateDatabaseStatus> {
    const url = readConnectionUrl()
    const parsed = url === undefined ? undefined : parseConnectionUrl(url)
    const probe = this.probe
    if (parsed === undefined || probe === undefined) {
      // Absent configuration is the same answer `status` gives; reuse it rather
      // than inventing a second vocabulary for one state.
      return this.status()
    }
    const base: Omit<CognateDatabaseStatus, 'databases' | 'assets'> = {
      configured: true,
      reachable: true,
      endpoint: `${parsed.host}:${parsed.port}`,
      user: parsed.user,
      database: selection.database,
    }
    let databases: readonly string[]
    try {
      databases = await probe.listDatabases()
    } catch (error) {
      return { ...base, reachable: false, reason: describeConnectionFailure(error), databases: [], assets: [] }
    }
    const choices: CognateDatabaseChoice[] = databases.slice(0, MAX_MEMBERS).map(name => ({ name }))
    if (!databases.includes(selection.database)) {
      return { ...base, reason: `database "${selection.database}" is not visible to this connection`, databases: choices, assets: [] }
    }
    try {
      return { ...base, assets: classifyAssets(await probe.listRelations(selection.database)), databases: choices }
    } catch (error) {
      return { ...base, reason: describeConnectionFailure(error), databases: choices, assets: [] }
    }
  }
}

/**
 * Read one metadata column as a name.
 *
 * MySQL reports these columns as strings; anything else means the statement did
 * not return what was asked for, so returning an empty name surfaces the row as
 * unusable rather than rendering an object's default stringification.
 * @param value - raw column value.
 * @returns the name, or an empty string when the value is not a string.
 */
function nameOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Read the deployment's connection URL from the environment.
 * @returns the configured URL, or undefined when the variable is unset or empty.
 */
function readConnectionUrl(): string | undefined {
  const value = process.env[CONNECTION_URL_VARIABLE]
  return value === undefined || value.trim() === '' ? undefined : value
}

/** One part of a parsed connection URL. */
interface ParsedConnection {
  readonly host: string
  readonly port: number
  readonly user: string
  readonly database?: string
}

/**
 * Parse a MySQL connection URL into display facts, discarding the password.
 * @param url - connection URL as configured.
 * @returns the displayable parts, or undefined when the URL is unusable.
 */
function parseConnectionUrl(url: string): ParsedConnection | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    // `new URL` is the only statement in the try; a malformed deployment
    // setting is the sole failure it can raise here.
    return undefined
  }
  if (parsed.protocol !== 'mysql:' && parsed.protocol !== 'mariadb:') return undefined
  const database = parsed.pathname.replace(/^\//u, '')
  return {
    host: parsed.hostname,
    port: parsed.port === '' ? 3306 : Number(parsed.port),
    user: decodeURIComponent(parsed.username),
    ...(database === '' ? {} : { database }),
  }
}

/**
 * Split relations into the asset kinds the Settings page renders.
 *
 * The ontology views in these deployments are physically `BASE TABLE` rows in
 * the MySQL wire protocol, so the naming convention the Cognate prompt already
 * relies on is the authority for what counts as an ontology view; the relation
 * kind cannot distinguish them.
 * @param relations - tables and views of one database.
 * @returns the groups, each bounded and name-sorted for stable display.
 */
function classifyAssets(relations: readonly { name: string; kind: 'table' | 'view' }[]): CognateAssetGroup[] {
  const ontology: string[] = []
  const rag: string[] = []
  const tables: string[] = []
  for (const relation of relations) {
    if (relation.name.startsWith(ONTOLOGY_VIEW_PREFIX)) ontology.push(relation.name)
    else if (/(?:ragbkt|chunks|raw_files)/iu.test(relation.name)) rag.push(relation.name)
    else tables.push(relation.name)
  }
  return [
    { kind: 'tables', members: tables.slice(0, MAX_MEMBERS).sort() },
    { kind: 'ontology', members: ontology.slice(0, MAX_MEMBERS).sort() },
    { kind: 'rag', members: rag.slice(0, MAX_MEMBERS).sort() },
    { kind: 'conceptTrees', members: [] },
  ]
}

/**
 * Turn a driver failure into an actionable message for the operator.
 *
 * Driver errors carry the host, port, and user in their text but never the
 * password, so the message is safe to return to the browser.
 * @param error - the failure raised by the probe.
 * @returns a one-line explanation.
 */
function describeConnectionFailure(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return `could not reach AkashXDB: ${detail}`
}

export default CognateController
