/**
 * Shared vocabulary of the Cognate database settings surface.
 *
 * The Host owns the connection; the browser receives only display facts. No
 * member of these types carries a password or a full connection string, because
 * every one of them crosses to the browser.
 *
 * @module @akashx/akx-api-cognate-controller/types
 */

/** One semantic asset kind, with the members the connection actually exposes. */
export interface CognateAssetGroup {
  /** Stable kind id; the browser owns its localized label. */
  readonly kind: 'tables' | 'ontology' | 'rag' | 'conceptTrees'
  /** Member names as the server reports them. */
  readonly members: readonly string[]
}

/** One database the connection can address. */
export interface CognateDatabaseChoice {
  /** Database name, submitted back when selected. */
  readonly name: string
}

/** Live Cognate database status for the Settings surface. */
export interface CognateDatabaseStatus {
  /** Whether a connection URL is configured for this deployment. */
  readonly configured: boolean
  /** Whether a connection attempt against the configured URL succeeded. */
  readonly reachable: boolean
  /** Host and port in use, when configured. Never includes credentials. */
  readonly endpoint?: string
  /** Database in use, when known. */
  readonly database?: string
  /** User in use, when configured. Never includes a password. */
  readonly user?: string
  /** Actionable explanation when the connection is unavailable. */
  readonly reason?: string
  /** Databases the server advertises, when reachable. */
  readonly databases: readonly CognateDatabaseChoice[]
  /** Semantic assets of the selected database, when reachable. */
  readonly assets: readonly CognateAssetGroup[]
}

/** Request naming the database to inspect. */
export interface CognateDatabaseSelection {
  /** Database name previously reported by {@link CognateDatabaseStatus.databases}. */
  readonly database: string
}
