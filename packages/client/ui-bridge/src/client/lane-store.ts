/**
 * The Bridge lane roster: which Sessions are open in the panel and what mode
 * each one runs.
 *
 * A lane spawns a blank Session and then seats it on a preset, because that is
 * the only path the product supports — the client's create takes no preset, and
 * the Host refuses to reseat a Session that has already run a turn. Spawning
 * blank and selecting immediately is exactly what the new-session chip does.
 *
 * @module @akashx/akx-client-ui-bridge/lane-store
 */

import type { Context as ClientContext } from '@akashx/cordis'
// Type-only: pulls the ctx.remote merge carrying the agent-preset roster.
import type {} from '@akashx/akx-api-remotes/client'
// Type-only: pulls the conversation service onto a Session-scoped context.
import type {} from '@akashx/akx-client-ui-conversation/client'
import type { SessionId } from '@akashx/akx-session/types'
import { createSnapshotStore, type SnapshotStore } from '@akashx/akx-client-store'
import type {} from '@akashx/akx-agent-presets/types'
import { EMPTY_READING, readLane, type LaneReading } from './lane-watch.ts'

/** One mode a lane may be seated on. */
export interface BridgeMode {
  readonly id: string
  readonly name: string
}

/** One open lane: a Session, the mode it runs, and how far it got. */
export interface BridgeLane {
  /** Stable key for the lane, independent of whether its Session exists yet. */
  readonly key: string
  /** The lane's Session, absent while it is still being created. */
  readonly sessionId?: SessionId
  /** The preset the lane asked for; the Session carries the authoritative one. */
  readonly modeId?: string
  readonly status: 'spawning' | 'ready' | 'failed'
  /** Why the lane could not open, when it could not. */
  readonly error?: string
  /** What the lane is reporting right now. */
  readonly reading: LaneReading
}

/** Panel snapshot the renderer subscribes to. */
export interface BridgeState {
  readonly lanes: readonly BridgeLane[]
  /** Modes the deployment currently supplies, for the add control and the per-lane chips. */
  readonly modes: readonly BridgeMode[]
  /** The lane the composer addresses alone; null sends to every lane. */
  readonly focused: string | null
  readonly error: string | null
}

/** How many times a settled lane re-reads the list, and how far apart. */
const SETTLE_PULLS = 6
const SETTLE_PULL_MS = 2500

const INITIAL: BridgeState = { lanes: [], modes: [], focused: null, error: null }

/** Owns the lane roster and the Session work behind it. */
export class BridgeLaneController {
  /** Snapshot the panel subscribes to. */
  readonly store: SnapshotStore<BridgeState> = createSnapshotStore(INITIAL)

  private nextKey = 0

  /** Active settle-pull timer, so overlapping settles share one. */
  private settling: ReturnType<typeof setInterval> | undefined

  constructor(private readonly ctx: ClientContext) {}

  private set(patch: Partial<BridgeState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  private replace(key: string, patch: Partial<BridgeLane>): void {
    this.set({
      lanes: this.store.getSnapshot().lanes.map(lane => lane.key === key ? { ...lane, ...patch } : lane),
    })
  }

  /**
   * Read the modes a lane may be seated on.
   *
   * Hidden presets are omitted for the same reason the picker omits them: a
   * retired mode stays resolvable for the Sessions already on it, but nothing
   * new should be opened against it.
   * @returns once the snapshot reflects the roster.
   */
  async loadModes(): Promise<void> {
    const result = await this.ctx.remote.agentPresets.list()
    if (!result.ok) {
      this.set({ error: result.error.message })
      return
    }
    const modes = result.value.presets
      .filter(preset => preset.broken === undefined && preset.hidden !== true)
      .map(preset => ({ id: preset.id, name: preset.name ?? preset.id }))
    this.set({ modes, error: null })
  }

  /**
   * Open one lane on the given mode.
   *
   * The lane appears immediately in its spawning state so the panel shows the
   * work starting rather than nothing until the Session exists.
   * @param modeId - the preset to seat the lane's Session on.
   */
  async addLane(modeId: string): Promise<void> {
    const key = `lane-${this.nextKey += 1}`
    this.set({ lanes: [...this.store.getSnapshot().lanes, { key, modeId, status: 'spawning', reading: EMPTY_READING }] })
    try {
      const sessionId = await this.ctx.sessions.create({})
      // Seat before anything runs: the Host refuses to reseat a Session that
      // has already taken a turn, so this is the only window for it.
      const seated = await this.ctx.remote.agentPresets.select(sessionId, modeId)
      if (!seated.ok) {
        this.replace(key, { sessionId, status: 'failed', error: seated.error.message })
        return
      }
      this.replace(key, { sessionId, status: 'ready' })
      this.publishReadings()
    } catch (error: unknown) {
      this.replace(key, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Follow one lane's Session and publish what it reports.
   *
   * The values are that Session's own projections, so a lane steered from the
   * conversation view updates here too -- Bridge shows a Session, it does not
   * own one.
   * @param key - the lane to publish under.
   * @param sessionId - the Session to follow.
   */
  /**
   * Publish every lane's reading from the Session list.
   *
   * The list carries each Session's own projection values, which is the only
   * source that serves a Session the client has not opened -- and Bridge never
   * opens one, because opening means becoming the current Session and only one
   * can be. One subscription covers every lane rather than one per lane.
   */
  /** Re-read every lane from the Session list. */
  refresh(): void {
    this.publishReadings()
  }

  /**
   * Pull fresh Session-list hints for a little while after a lane stops working.
   *
   * A lane's deployment spend reaches the list through a write-behind checkpoint,
   * so it is still absent at the moment the answer appears. Without this the cost
   * of a question lands a minute after the answer it belongs to, which is no use
   * beside it. The retries stop on their own rather than polling forever.
   */
  private pullSettledReadings(): void {
    if (this.settling !== undefined) return
    let attempts = 0
    const tick = (): void => {
      attempts += 1
      void this.ctx.sessions.refresh()
      if (attempts >= SETTLE_PULLS) {
        clearInterval(this.settling)
        this.settling = undefined
      }
    }
    this.settling = setInterval(tick, SETTLE_PULL_MS)
  }

  private publishReadings(): void {
    const { byId } = this.ctx.sessions.list.getSnapshot()
    const previous = this.store.getSnapshot().lanes
    const lanes = previous.map((lane) => {
      if (lane.sessionId === undefined) return lane
      const summary = byId[lane.sessionId]
      if (summary === undefined) return lane
      const values: Record<string, unknown> = summary.projectionValues ?? {}
      const reading = readLane(
        values.tokenUsage, values.cognateUsage, values.sessionStats, values.turnOutline,
        summary.running,
      )
      return { ...lane, reading }
    })
    this.set({ lanes })
    // A lane that just stopped working is the moment its spend is still missing.
    const settled = lanes.some((lane, at) =>
      previous[at]?.reading.running === true && !lane.reading.running)
    if (settled) this.pullSettledReadings()
  }

  /**
   * Drop one lane from the panel.
   *
   * The Session itself is left alone: it is an ordinary Session that remains in
   * the sidebar and keeps its durable log, so removing a lane closes a view
   * rather than discarding work.
   * @param key - the lane to remove.
   */
  removeLane(key: string): void {
    const { lanes, focused } = this.store.getSnapshot()
    this.set({
      lanes: lanes.filter(lane => lane.key !== key),
      focused: focused === key ? null : focused,
    })
  }

  /**
   * Reseat one lane on a different mode.
   *
   * Only before the lane has run: the Host refuses to recompose a Session whose
   * history was produced under another preset, which is the same rule that keeps
   * a comparison honest. A lane that has answered is therefore left alone and the
   * caller is told why.
   * @param key - the lane to reseat.
   * @param modeId - the preset to seat it on instead.
   */
  async changeMode(key: string, modeId: string): Promise<void> {
    const lane = this.store.getSnapshot().lanes.find(candidate => candidate.key === key)
    if (lane?.sessionId === undefined) return
    if (lane.reading.answer !== undefined || lane.reading.running) return
    const seated = await this.ctx.remote.agentPresets.select(lane.sessionId, modeId)
    if (!seated.ok) {
      this.replace(key, { error: seated.error.message })
      return
    }
    // The key is dropped rather than set undefined: a reseated lane has no error,
    // and `exactOptionalPropertyTypes` treats the two as different states.
    this.set({
      lanes: this.store.getSnapshot().lanes.map((candidate) => {
        if (candidate.key !== key) return candidate
        const { error: _cleared, ...rest } = candidate
        return { ...rest, modeId }
      }),
    })
  }

  /**
   * Address the composer at one lane, or at every lane.
   * @param key - the lane to steer alone, or null for all of them.
   */
  focus(key: string | null): void {
    this.set({ focused: key })
  }

  /**
   * Send one prompt to every lane, or to the focused lane alone.
   *
   * Each lane is addressed through its own Session scope, so the prompt takes
   * the same submission path a person typing into that conversation would --
   * the same draft handling, the same queue-versus-steer decision, the same
   * durable user message. Bridge adds no second way to talk to an Agent.
   *
   * Lanes are dispatched together rather than in turn: the comparison being
   * drawn is between paths running at once, and awaiting each one would stage
   * them into a sequence that misreports every elapsed time after the first.
   * @param text - the prompt, sent verbatim to each addressed lane.
   */
  async ask(text: string): Promise<void> {
    const { lanes, focused } = this.store.getSnapshot()
    const addressed = lanes.filter(lane =>
      lane.status === 'ready' && lane.sessionId !== undefined && (focused === null || lane.key === focused))
    await Promise.all(addressed.map(async (lane) => {
      const scope = this.ctx.sessions.scope(lane.sessionId as SessionId)
      // `scope.conversation` would be refused: the Session scope is its own
      // context with its own inject set, which this plugin's declaration does not
      // reach. `get` resolves the same service and rebinds it to the scope, so the
      // send still lands on that lane's Session rather than the root.
      const conversation = scope?.get('conversation')
      if (conversation === undefined) {
        this.replace(lane.key, { error: 'lane has no live session scope' })
        return
      }
      try {
        await conversation.send(text)
      } catch (error: unknown) {
        this.replace(lane.key, { error: error instanceof Error ? error.message : String(error) })
      }
    }))
  }

  /**
   * Show one lane's Session in the conversation view.
   * @param sessionId - the lane's Session.
   */
  open(sessionId: SessionId): void {
    this.ctx.sessions.open(sessionId)
    this.ctx.layout.selectPanel(null)
  }
}
