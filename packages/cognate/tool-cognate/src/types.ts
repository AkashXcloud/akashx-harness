/**
 * Client-safe vocabulary for the deployment spend this tool records.
 *
 * @module @akashx/akx-tool-cognate/types
 */

/** One deployment model's share of the spend, so a total can be priced rather than guessed. */
export interface CognateUsageRoute {
  /** Provider that billed the spend, as the deployment names it. */
  readonly provider: string
  /** Model that billed the spend, as the deployment names it. */
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  /** Cognitive statements billed to this route. */
  readonly calls: number
}

/**
 * Durable totals of what the DEPLOYMENT's models spent across a complete session log.
 *
 * These are NOT the session's own model usage and must never be added into it without
 * saying so: a session runs one model while the statements it issues are answered by
 * another, priced separately. `routes` carries the attribution that makes the split
 * legible.
 *
 * `stageMs` is time spent inside the deployment, not the tool call's wall time — the
 * harness already measures that — so it answers how much of a slow statement was the
 * deployment's own model rather than transport or queueing.
 */
export interface CognateUsageProjection {
  /** Prompt tokens billed by deployment models, summed over every cognitive statement. */
  readonly inputTokens: number
  readonly outputTokens: number
  /** Thinking share already counted inside `outputTokens`; never added on top of it. */
  readonly reasoningTokens: number
  /** Cognitive statements that reported spend. */
  readonly calls: number
  /** Summed deployment-side stage time, ms. */
  readonly stageMs: number
  /** Per-model attribution of the same totals. */
  readonly routes: readonly CognateUsageRoute[]
}

declare module '@akashx/akx-session-projection/types' {
  interface SessionProjectionMap {
    /** Deployment-side model spend accumulated across the complete durable log. */
    cognateUsage: CognateUsageProjection
  }
}
