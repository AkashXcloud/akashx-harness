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
import type { SessionId } from '@akashx/akx-session/types'
import { createSnapshotStore, type SnapshotStore } from '@akashx/akx-client-store'
import type {} from '@akashx/akx-agent-presets/types'

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

const INITIAL: BridgeState = { lanes: [], modes: [], focused: null, error: null }

/** Owns the lane roster and the Session work behind it. */
export class BridgeLaneController {
  /** Snapshot the panel subscribes to. */
  readonly store: SnapshotStore<BridgeState> = createSnapshotStore(INITIAL)

  private nextKey = 0

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
    this.set({ lanes: [...this.store.getSnapshot().lanes, { key, modeId, status: 'spawning' }] })
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
    } catch (error: unknown) {
      this.replace(key, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
    }
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
   * Address the composer at one lane, or at every lane.
   * @param key - the lane to steer alone, or null for all of them.
   */
  focus(key: string | null): void {
    this.set({ focused: key })
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
