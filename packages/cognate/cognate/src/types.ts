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
}

/** Provider implementation for one AkashXDB transport. */
export interface CognateProvider {
  readonly id: string
  available(): boolean
  /** Explain why the provider cannot accept a request when unavailable. */
  availabilityReason?(): string | undefined
  context(): CognateSemanticContext | undefined
  execute(request: CognateQueryRequest): Promise<CognateQueryResult>
  probe?(probes: readonly CognateCapabilityProbe[], signal: AbortSignal): Promise<readonly CognateProbeResult[]>
}
