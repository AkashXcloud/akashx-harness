/** Types shared by the Cognate/AkashXDB service and its consumers. */

import type { JsonValue } from '@akashx/akx-util-values'

/** Operation class selected from a submitted SQL statement. */
export type CognateQueryKind = 'metadata' | 'read' | 'cognitive' | 'mutation'

/** One column returned by AkashXDB. */
export interface CognateColumn {
  readonly name: string
  readonly type?: string
}

/** One business metric definition included in semantic context. */
export interface CognateMetric {
  /** Stable metric name. */
  readonly name: string
  /** Human-readable formula or business meaning. */
  readonly definition: string
}

/** A source citation returned by a RagBucket or document function. */
export interface CognateCitation {
  readonly sourceIndex?: number
  /** Stable document identifier returned by the provider. */
  readonly documentId?: string
  /** Knowledge-base identifier returned by the provider. */
  readonly knowledgeBaseId?: string
  readonly document?: string
  readonly page?: number
  readonly text?: string
  readonly start?: number
  readonly end?: number
  /** Concept-tree leaf path for per-document cognitive_ask results. */
  readonly nodePath?: readonly string[]
  /** Provider confidence for a concept-tree answer or evidence span. */
  readonly confidence?: number
  /** Whether the provider verified the citation against source text. */
  readonly verified?: boolean
}

/** One deployed concept-tree source available for per-document cognitive_ask. */
export interface CognateConceptTree {
  /** RagBucket backing source or fully qualified source table. */
  readonly source: string
  /** Whether the deployment has enabled concept-tree indexing for the source. */
  readonly enabled?: boolean
  /** Concept-tree domain supplied during ingestion, when known. */
  readonly domain?: string
}

/** Bounded semantic metadata shown to the model as runtime context. */
export interface CognateSemanticContext {
  /** SQL dialect accepted by the selected database. */
  readonly dialect?: string
  /** AkashXDB catalog selected for this session. */
  readonly catalog?: string
  /** AkashXDB database selected for this session. */
  readonly database?: string
  /** Known ordinary tables and views. */
  readonly tables?: readonly string[]
  /** Known structured extraction tables. */
  readonly ontologyViews?: readonly string[]
  /** Known document corpora queried with ASK. */
  readonly ragBuckets?: readonly string[]
  /** Known per-document concept-tree sources used by cognitive_ask. */
  readonly conceptTrees?: readonly CognateConceptTree[]
  /** Curated business metric definitions. */
  readonly metrics?: readonly CognateMetric[]
  /** Additional source-selection or dialect instructions. */
  readonly instructions?: readonly string[]
}

/** A provider request after the service has classified and authorized it. */
export interface CognateQueryRequest {
  readonly sql: string
  readonly kind: CognateQueryKind
  readonly signal: AbortSignal
}

/** One host-owned AkashXDB capability statement to probe before use. */
export interface CognateCapabilityProbe {
  /** Stable deployment-defined capability name. */
  readonly id: string
  /** One metadata, read, or explicitly enabled cognitive SQL statement. */
  readonly sql: string
  /** Whether an unsupported capability aborts the probe operation. */
  readonly required?: boolean
}

/** Outcome of one host-owned AkashXDB capability probe. */
export interface CognateProbeResult {
  /** Capability name supplied by the caller. */
  readonly id: string
  /** Whether the selected deployment accepted the probe statement. */
  readonly supported: boolean
}

/** Token spend and stage timing billed to the DEPLOYMENT's models by one cognitive statement.
 *
 * These figures are separate from the harness's own model usage: a session running one model
 * can issue statements the database answers with another. Callers that present a single total
 * must keep {@link CognateUsage.provider} and {@link CognateUsage.model} alongside it, because
 * the two pools are priced independently.
 */
export interface CognateUsage {
  /** Prompt tokens the deployment billed, summed over every stage that reports them. */
  readonly inputTokens?: number
  readonly outputTokens?: number
  /** Thinking share already counted inside `outputTokens`; never added on top of it. */
  readonly reasoningTokens?: number
  /** Provider that billed the spend, as the deployment names it. */
  readonly provider?: string
  /** Model that billed the spend, as the deployment names it. */
  readonly model?: string
  /** Wall time per named pipeline stage, in milliseconds. */
  readonly stageMs?: Readonly<Record<string, number>>
  /** Non-token billing units, such as reranker search units, per named unit. */
  readonly units?: Readonly<Record<string, number>>
}

/** Provider-normalized query output before service-owned result bounds. */
export interface CognateQueryResult {
  readonly sql: string
  readonly kind: CognateQueryKind
  readonly columns: readonly CognateColumn[]
  readonly rows: readonly Record<string, JsonValue>[]
  readonly answer?: string
  readonly citations: readonly CognateCitation[]
  readonly truncated?: boolean
  readonly queryId?: string
  readonly externalOperation: boolean
  /** Deployment-side spend for a cognitive statement, when the statement reported any. */
  readonly usage?: CognateUsage
}

/** Provider implementation for one AkashXDB transport. */
export interface CognateProvider {
  readonly id: string
  available(): boolean
  /** Explain why the provider cannot accept a request when unavailable. */
  availabilityReason?(): string | undefined
  context(): CognateSemanticContext | undefined
  execute(request: CognateQueryRequest): Promise<CognateQueryResult>
  /** Fetch the deployment's spend for an executed statement that did not report it in its own
   * result row. Implemented only by providers that can reach the deployment's profile service;
   * failing to retrieve a profile yields undefined rather than failing the completed statement.
   * @param queryId - deployment query id captured when the statement ran.
   * @param signal - cancellation signal for the lookup.
   * @returns usage when the deployment served a profile carrying it.
   */
  usage?(queryId: string, signal: AbortSignal): Promise<CognateUsage | undefined>
  probe?(probes: readonly CognateCapabilityProbe[], signal: AbortSignal): Promise<readonly CognateProbeResult[]>
}
