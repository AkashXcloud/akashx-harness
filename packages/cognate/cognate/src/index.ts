/** AkashXDB/Cognate service definition, provider selection, and SQL policy. @module @akashx/akx-cognate */

import { Context, Service } from '@akashx/cordis'
import z from '@akashx/schemastery'
import { snapshotJsonValue, type JsonValue } from '@akashx/akx-util-values'
import { authorizeSql, classifySql } from './policy.ts'
import { deriveUsage } from './usage.ts'
import type { CognateCapabilityProbe, CognateProbeResult, CognateProvider, CognateQueryResult, CognateSemanticContext } from './types.ts'

export type * from './types.ts'
export { authorizeSql, classifySql, redactSqlForPolicy, statementCount } from './policy.ts'
export { deriveUsage, parseProfileUsage } from './usage.ts'

declare module '@akashx/cordis' {
  interface Context { cognate: CognateRuntime }
}

/** Runtime limits and provider selection for the Cognate capability. */
export interface CognateConfig {
  /** Provider id to use; omitted when exactly one provider is usable. */
  readonly provider?: string
  /** Permit ASK and cognitive UDF calls that may invoke external services. */
  readonly allowExternalOperations?: boolean
  /** When set, the only cognitive operations this session may invoke, e.g.
   * `['ask']` or `['cognitive_ask']`. Lets one deployment expose a single
   * retrieval path while `allowExternalOperations` is on. Omitted permits all. */
  allowedOperations?: string[]
  /** Substrings no statement may reference, e.g. `['_chunks']`. Gates the read paths
   * that SQL classification cannot tell apart. */
  deniedIdentifiers?: string[]
  /** Maximum SQL statement length in characters. */
  readonly maxSqlLength?: number
  /** Maximum returned rows retained in one result. */
  readonly maxRows?: number
  /** Maximum serialized result size in UTF-8 bytes. */
  readonly maxBytes?: number
  /** Maximum semantic-context prompt length in characters. */
  readonly contextMaxChars?: number
  /** Deployment-supplied semantic model and source catalog. */
  readonly semanticContext?: CognateSemanticContext
}

/** Schemastery configuration for {@link CognateRuntime}. */
export const Config: z<CognateConfig> = z.object({
  provider: z.string(),
  allowExternalOperations: z.boolean().default(false),
  allowedOperations: z.array(z.string()).default([]),
  deniedIdentifiers: z.array(z.string()).default([]),
  maxSqlLength: z.number().default(100_000),
  maxRows: z.number().default(200),
  maxBytes: z.number().default(1_000_000),
  contextMaxChars: z.number().default(16_000),
  semanticContext: z.any(),
})

/** A configured list, or undefined when it is unset. Schemastery materializes an unset
 * `z.array()` as `[]`, and an empty allowlist must not read as "deny everything". */
function configuredList(value: readonly string[] | undefined): readonly string[] | undefined {
  return value !== undefined && value.length > 0 ? value : undefined
}

/** Provider registry and bounded AkashXDB execution service. */
export class CognateRuntime extends Service {
  static Config = Config
  private readonly providers = new Map<string, CognateProvider>()

  constructor(ctx: Context, public readonly config: CognateConfig) {
    super(ctx, 'cognate')
    assertConfig(config)
  }

  /** Register one transport provider and return its lifecycle disposer.
   * @param provider - provider to add to the runtime registry.
   * @returns disposer that removes the provider.
   */
  registerProvider(provider: CognateProvider): () => void {
    if (this.providers.has(provider.id)) throw new Error(`cognate provider "${provider.id}" is already registered`)
    this.providers.set(provider.id, provider)
    // oxlint-disable-next-line typescript/no-misused-promises -- synchronous cleanup; direct return preserves disposer identity
    return this.ctx.effect(() => () => { this.providers.delete(provider.id) }, 'cognate.registerProvider()')
  }

  /** Return the bounded context currently supplied by the selected provider.
   * @returns provider-supplied semantic context, when available.
   */
  context(): CognateSemanticContext | undefined {
    const provider = this.resolveProvider(false)
    return provider?.context() ?? this.config.semanticContext
  }

  /**
   * Describe the selected provider state for model-facing prompt context.
   * @returns provider id, readiness, and an actionable unavailable reason.
   */
  availability(): { provider: string | undefined; available: boolean; reason?: string } {
    const configured = this.config.provider
    if (configured !== undefined) {
      const provider = this.providers.get(configured)
      if (provider === undefined) return { provider: configured, available: false, reason: `provider "${configured}" is not registered` }
      if (!provider.available()) {
        const reason = provider.availabilityReason?.()
        return reason === undefined
          ? { provider: configured, available: false }
          : { provider: configured, available: false, reason }
      }
      return { provider: configured, available: true }
    }
    const available = [...this.providers.values()].filter(provider => provider.available())
    if (available.length === 1) return { provider: available[0]?.id, available: true }
    if (available.length === 0) return { provider: undefined, available: false, reason: 'no usable provider is registered' }
    return { provider: undefined, available: false, reason: 'multiple usable providers are registered; configure one explicitly' }
  }

  /** Classify, authorize, execute, and bound one model-submitted SQL call.
   * @param request - SQL text and caller cancellation signal.
   * @returns normalized and bounded query result.
   */
  async execute(request: { readonly sql: string; readonly signal: AbortSignal }): Promise<CognateQueryResult> {
    const maxSqlLength = this.config.maxSqlLength ?? 100_000
    if (request.sql.length > maxSqlLength) throw new Error(`Cognate SQL exceeds the ${maxSqlLength} character limit`)
    const kind = classifySql(request.sql)
    authorizeSql(request.sql, kind, this.config.allowExternalOperations === true,
      configuredList(this.config.allowedOperations), configuredList(this.config.deniedIdentifiers))
    const provider = this.resolveProvider(true)
    if (provider === undefined) throw new Error('no usable Cognate provider is registered')
    const result = await provider.execute({ sql: request.sql, kind, signal: request.signal })
    // Read the deployment's own spend off the uncapped rows: the figures live in the result
    // row itself, which row bounding may drop.
    // ASK reports its spend in the row; cognitive_ask reports it only in the query profile,
    // which costs a second round trip and is therefore attempted only when the row had none.
    const usage = result.usage ?? deriveUsage(result)
      ?? (result.queryId === undefined ? undefined : await provider.usage?.(result.queryId, request.signal))
    const measured = usage === undefined ? result : { ...result, usage }
    return capResult(measured, this.config.maxRows ?? 200, this.config.maxBytes ?? 1_000_000)
  }

  /** Run host-owned deployment capability checks through the selected provider.
   * @param probes - named, read-policy-checked SQL statements to execute.
   * @param signal - cancellation signal for the whole probe operation.
   * @returns support result for every requested capability.
   */
  async probe(probes: readonly CognateCapabilityProbe[], signal: AbortSignal): Promise<readonly CognateProbeResult[]> {
    const ids = new Set<string>()
    for (const probe of probes) {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(probe.id)) throw new Error(`invalid Cognate capability id "${probe.id}"`)
      if (ids.has(probe.id)) throw new Error(`duplicate Cognate capability id "${probe.id}"`)
      ids.add(probe.id)
      if (probe.sql.length > (this.config.maxSqlLength ?? 100_000)) throw new Error(`Cognate capability "${probe.id}" exceeds the SQL character limit`)
      const kind = classifySql(probe.sql)
      authorizeSql(probe.sql, kind, this.config.allowExternalOperations === true,
        configuredList(this.config.allowedOperations), configuredList(this.config.deniedIdentifiers))
    }
    const provider = this.resolveProvider(true)
    if (provider === undefined) throw new Error('no usable Cognate provider is registered')
    if (provider.probe === undefined) throw new Error(`configured Cognate provider "${provider.id}" does not support capability probes`)
    const results = await provider.probe(probes, signal)
    if (results.length !== probes.length || results.some((result, index) => result.id !== probes[index]?.id)) {
      throw new Error(`configured Cognate provider "${provider.id}" returned an invalid capability-probe result`)
    }
    const failed = results.filter((result, index) => probes[index]?.required === true && !result.supported)
    if (failed.length > 0) throw new Error(`required Cognate capabilities are unsupported: ${failed.map(result => result.id).join(', ')}`)
    return results
  }

  private resolveProvider(required: boolean): CognateProvider | undefined {
    const configured = this.config.provider
    if (configured !== undefined) {
      const provider = this.providers.get(configured)
      if (provider === undefined) {
        if (required) throw new Error(`configured Cognate provider "${configured}" is not registered`)
        return undefined
      }
      if (!provider.available()) {
        if (required) throw new Error(`configured Cognate provider "${configured}" is unavailable: ${provider.availabilityReason?.() ?? 'the provider is not ready'}`)
        return undefined
      }
      return provider
    }
    const available = [...this.providers.values()].filter(provider => provider.available())
    if (available.length === 1) return available[0]
    if (required && available.length === 0) throw new Error('no usable Cognate provider is registered')
    if (required) throw new Error('multiple usable Cognate providers are registered; configure one explicitly')
    return undefined
  }
}

function assertConfig(config: CognateConfig): void {
  const values: readonly [string, number | undefined][] = [
    ['maxSqlLength', config.maxSqlLength],
    ['maxRows', config.maxRows],
    ['maxBytes', config.maxBytes],
    ['contextMaxChars', config.contextMaxChars],
  ]
  for (const [name, value] of values) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) throw new Error(`cognate: ${name} must be a positive safe integer`)
  }
}

function capResult(result: CognateQueryResult, maxRows: number, maxBytes: number): CognateQueryResult {
  let rows = [...result.rows]
  let truncated = false
  if (rows.length > maxRows) {
    rows = rows.slice(0, maxRows)
    truncated = true
  }
  const fits = (candidate: readonly Record<string, JsonValue>[]) => Buffer.byteLength(JSON.stringify({ ...result, rows: candidate }), 'utf8') <= maxBytes
  while (rows.length > 0 && !fits(rows)) {
    rows = rows.slice(0, -1)
    truncated = true
  }
  if (!fits(rows)) throw new Error(`Cognate result exceeds the ${maxBytes} byte limit`)
  const bounded = { ...result, rows, ...truncated ? { truncated: true } : {} }
  return snapshotJsonValue(bounded) as CognateQueryResult
}

export default CognateRuntime
