/**
 * What one lane reports while it works: its latest answer, what it spent, and
 * how long it took.
 *
 * Every figure is read from that Session's own projections rather than from its
 * event window. A window only fills for a Session the client has opened, and
 * only one Session is open at a time, so a panel watching several lanes at once
 * cannot use it. Projections are host-computed and served per Session, which is
 * exactly the shape this needs.
 *
 * The harness total and the deployment total stay apart because they are billed
 * to different models at different prices, which is the comparison the panel
 * exists to draw; blending them would answer no question correctly.
 *
 * @module @akashx/akx-client-ui-bridge/lane-watch
 */

/** Live reading for one lane, derived from its Session's projections. */
export interface LaneReading {
  /** Whether the lane's Session is currently working. */
  readonly running: boolean
  /** The latest turn's answer preview, absent until a turn ends with text. */
  readonly answer?: string
  /** Prompt-side tokens this Session's own model was billed, excluding cache reads. */
  readonly workingTokens: number
  /** Tokens the DEPLOYMENT's models spent answering. */
  readonly databaseTokens: number
  /** Model and tool wall time across the Session, in milliseconds. */
  readonly elapsedMs: number
}

/** A reading with nothing in it, for a lane that has not been asked anything. */
export const EMPTY_READING: LaneReading = {
  running: false, workingTokens: 0, databaseTokens: 0, elapsedMs: 0,
}

function count(source: unknown, key: string): number {
  if (typeof source !== 'object' || source === null) return 0
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

/**
 * Fold one lane's projection values into its reading.
 *
 * The answer is the newest turn's response preview, so a lane asked several
 * questions shows its most recent answer -- the panel compares one question
 * across lanes rather than a lane's history against itself.
 *
 * @param tokenUsage - the Session's `tokenUsage` projection value.
 * @param cognateUsage - the Session's `cognateUsage` projection value.
 * @param sessionStats - the Session's `sessionStats` projection value.
 * @param turnOutline - the Session's `turnOutline` projection value.
 * @param running - whether the Session is working, from its own snapshot.
 * @returns the lane's current reading.
 */
export function readLane(
  tokenUsage: unknown,
  cognateUsage: unknown,
  sessionStats: unknown,
  turnOutline: unknown,
  running: boolean,
): LaneReading {
  // Same arithmetic as the composer's usage pill: cache reads are the prefix the
  // Session had already paid for, while cache writes are new input it is paying
  // for now, so only reads are excluded.
  const workingTokens = count(tokenUsage, 'uncachedInputTokens')
    + count(tokenUsage, 'cacheWriteTokens')
    + count(tokenUsage, 'outputTokens')
  const databaseTokens = count(cognateUsage, 'inputTokens') + count(cognateUsage, 'outputTokens')
  const elapsedMs = count(sessionStats, 'llmMs') + count(sessionStats, 'toolMs')

  const turns: readonly unknown[] = Array.isArray(turnOutline) ? turnOutline : []
  const latest: unknown = turns.at(-1)
  const response: unknown = typeof latest === 'object' && latest !== null
    ? (latest as { response?: unknown }).response
    : undefined
  const answer = typeof response === 'string' && response.trim() !== '' ? response : undefined

  return {
    running,
    ...answer === undefined ? {} : { answer },
    workingTokens,
    databaseTokens,
    elapsedMs,
  }
}
