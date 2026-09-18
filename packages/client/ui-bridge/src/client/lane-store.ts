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
import type { WorkspaceId } from '@akashx/akx-workspace/types'
// Type-only: pulls the Workspace Controller service merge (ctx.get('workspaces')).
import type {} from '@akashx/akx-api-workspace-controller/client'
import { createSnapshotStore, type SnapshotStore } from '@akashx/akx-client-store'
import type {} from '@akashx/akx-agent-presets/types'
// Type-only: pulls the cost service merge (ctx.get('cost')), which is optional.
import type {} from '@akashx/akx-client-ui-cost/client'
import type { BenchAnswer } from '../bridge-settings.ts'
import { EMPTY_READING, readLane, type LaneReading } from './lane-watch.ts'
import { dealBlind, judgePrompt, readGrade, type JudgeVerdict } from './judge.ts'

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
  /** How the grader ruled on this lane's latest answer, once graded. */
  readonly verdict?: JudgeVerdict
}

/** Panel snapshot the renderer subscribes to. */
export interface BridgeState {
  readonly lanes: readonly BridgeLane[]
  /** Modes the deployment currently supplies, for the add control and the per-lane chips. */
  readonly modes: readonly BridgeMode[]
  /** The lane the composer addresses alone; null sends to every lane. */
  readonly focused: string | null
  /** The question every lane was last asked, which is the one being graded. */
  readonly asked: string
  /** Whether the deployment supplies an answer key at all. */
  readonly hasKey: boolean
  /** The answer-key row the last grade was measured against, once one has run. */
  readonly matched: BenchAnswer | undefined
  /** A typed answer, which replaces the key for one grade when it is not blank. */
  readonly gold: string
  /** Whether a grading run is in flight. */
  readonly judging: boolean
  readonly error: string | null
}

/** How often the panel re-reads the Session list while it is waiting on answers,
 * and how long it keeps asking before it gives up. */
const POLL_INTERVAL_MS = 3000
const POLL_MAX_TICKS = 100
/** How much longer the poll runs once every lane has answered, so the deployment
 * spend -- written behind the answer -- is read before the panel stops looking. */
const POLL_GRACE_TICKS = 6
/** How long to wait on the grader, and how often to look. */
const JUDGE_TIMEOUT_MS = 180_000
const JUDGE_POLL_MS = 2500

const INITIAL: BridgeState = {
  lanes: [], modes: [], focused: null, asked: '', hasKey: false, matched: undefined,
  gold: '', judging: false, error: null,
}

/** Owns the lane roster and the Session work behind it. */
export class BridgeLaneController {
  /** Snapshot the panel subscribes to. */
  readonly store: SnapshotStore<BridgeState> = createSnapshotStore(INITIAL)

  private nextKey = 0

  /** Active answer poll, so a second question replaces it rather than racing it. */
  private polling: ReturnType<typeof setInterval> | undefined

  /**
   * @param ctx - the browser plugin context.
   * @param answerKey - the deployment's benchmark answer key, read on each use so
   * a key edited in the settings document reaches the next grade.
   */
  constructor(
    private readonly ctx: ClientContext,
    private readonly answerKey: () => readonly BenchAnswer[] = () => [],
  ) {}

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
      const sessionId = await this.ctx.sessions.create(this.laneWorkspace())
      // Seat before anything runs: the Host refuses to reseat a Session that
      // has already taken a turn, so this is the only window for it.
      const seated = await this.ctx.remote.agentPresets.select(sessionId, modeId)
      if (!seated.ok) {
        this.replace(key, { sessionId, status: 'failed', error: seated.error.message })
        return
      }
      this.replace(key, { sessionId, status: 'ready' })
      this.publishReadings()
      this.showPanes()
    } catch (error: unknown) {
      this.replace(key, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * The workspace a new lane opens in.
   *
   * A lane without one is a Session with nowhere to work: its composer refuses
   * input until someone picks a workspace, which is not a choice a lane should
   * put in front of anyone. The current conversation's workspace is the answer
   * when there is one, because a comparison is run against what is already
   * open.
   * @returns the create options, empty when nothing is open to inherit from.
   */
  private laneWorkspace(): { workspaceId?: WorkspaceId } {
    const { current } = this.ctx.sessions.list.getSnapshot()
    if (current === undefined) return {}
    const workspaces = this.ctx.get('workspaces')
    const owner = workspaces?.list.getSnapshot().items
      .find(item => item.sessionIds.includes(current))
    return owner === undefined ? {} : { workspaceId: owner.workspaceId }
  }

  /** Re-read every lane from the Session list. */
  refresh(): void {
    this.publishReadings()
  }

  /**
   * Show the lanes as conversation panes, or leave pane mode.
   *
   * A pane is the ordinary conversation subtree bound to that lane's Session,
   * so every lane streams its steps exactly as the single view does. Bridge
   * names the Sessions; the conversation surface renders them.
   * @param open - false to return to the single current-Session view.
   */
  showPanes(open = true): void {
    const conversation = this.ctx.get('uiConversation')
    if (conversation === undefined) return
    if (!open) {
      conversation.showPanes(undefined)
      return
    }
    const panes = this.store.getSnapshot().lanes
      .map(lane => lane.sessionId)
      .filter((id): id is SessionId => id !== undefined)
    conversation.showPanes(panes)
    this.ctx.layout.selectPanel(null)
  }

  /** Stop the answer poll, for a panel that is going away. */
  stop(): void {
    if (this.polling === undefined) return
    clearInterval(this.polling)
    this.polling = undefined
  }

  /**
   * Re-read the Session list until every lane has answered and its spend is in.
   *
   * A lane's list row is built while its turn-end event is still being handled,
   * before the turn outline has folded that same event, so the row carries an
   * empty response and nothing rebuilds it afterwards. Re-reading is how the
   * answer reaches the panel at all.
   *
   * The poll is tied to the question rather than to an observed running-to-idle
   * transition, because the list does not reliably show one. It runs on past the
   * last answer for the grace window: a lane's deployment spend reaches the list
   * through a write-behind checkpoint and is still absent at the moment its
   * answer appears, and a cost that lands after the panel stopped looking reads
   * as a path that spent nothing. It gives up rather than polling for the life of
   * the panel.
   */
  private pollUntilAnswered(): void {
    this.stop()
    let ticks = 0
    let answeredAt: number | undefined
    this.polling = setInterval(() => {
      ticks += 1
      void this.ctx.sessions.refresh()
      const { lanes } = this.store.getSnapshot()
      const answered = lanes.length > 0 && lanes.every(lane => lane.reading.answer !== undefined)
      if (answered && answeredAt === undefined) answeredAt = ticks
      const done = answeredAt !== undefined && ticks >= answeredAt + POLL_GRACE_TICKS
      if (!done && ticks < POLL_MAX_TICKS) return
      this.stop()
    }, POLL_INTERVAL_MS)
  }

  /**
   * Price one lane's session, when a rate card is installed and covers it.
   *
   * The cost plugin is optional, so this reads it through the global store
   * rather than declaring it: a deployment that prices nothing still gets
   * every other figure.
   * @param values - that Session's projection values from the list.
   * @returns both pools in US dollars, or undefined when anything is unpriced.
   */
  private priceOf(values: Record<string, unknown>): number | undefined {
    const cost = this.ctx.get('cost')
    if (cost === undefined) return undefined
    const selection = values.modelSelection
    const lastUsed = typeof selection === 'object' && selection !== null
      ? (selection as { lastUsed?: { provider?: string; model?: string } | null }).lastUsed
      : undefined
    const model = lastUsed?.model === undefined
      ? undefined
      : { ...lastUsed.provider === undefined ? {} : { provider: lastUsed.provider }, model: lastUsed.model }
    const priced = cost.price(model, values.tokenUsage, values.cognateUsage)
    if (priced.unpriced.length > 0) return undefined
    if (priced.agentUsd === undefined && priced.deploymentUsd === undefined) return undefined
    return (priced.agentUsd ?? 0) + (priced.deploymentUsd ?? 0)
  }

  /**
   * Publish every lane's reading from the Session list.
   *
   * The list carries each Session's own projection values, which is the only
   * source that serves a Session the client has not opened -- and Bridge never
   * opens one, because opening means becoming the current Session and only one
   * can be. One subscription covers every lane rather than one per lane.
   */
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
        summary.running, this.priceOf(values),
      )
      return { ...lane, reading }
    })
    this.set({ lanes })
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
    this.showPanes()
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
    // Grading needs the question, and the panel is the only thing that knows it.
    // Recording it here is what lets the grade run from one button. A new
    // question clears the last grade's row, which was another question's.
    this.set({ asked: text, matched: undefined })
    this.pollUntilAnswered()
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
   * Set the answer the grader marks against, replacing the answer key.
   * @param gold - the known-good answer, or blank to grade against the key.
   */
  setGold(gold: string): void {
    this.set({ gold })
  }

  /**
   * Re-read whether the deployment supplies an answer key.
   *
   * Called again when the key itself changes, because the settings document it
   * comes from loads after the panel mounts and can be edited while it is open.
   */
  refreshKey(): void {
    this.set({ hasKey: this.answerKey().length > 0 })
  }

  /**
   * The rows this grade matches against.
   *
   * A typed answer is the whole key for that grade: someone who states the
   * answer has said which question was asked, so there is nothing left to
   * match.
   * @param state - the snapshot being graded from.
   * @returns the rows, empty when neither the key nor a typed answer supplies any.
   */
  private rowsFor(state: BridgeState): readonly BenchAnswer[] {
    const typed = state.gold.trim()
    if (typed !== '') return [{ id: 'typed', question: state.asked, gold: typed }]
    return this.answerKey()
  }

  /**
   * Grade every answered lane against the gold answer.
   *
   * The grading runs in a Session of its own. A lane's spend is the figure this
   * panel compares, so grading inside one would add tokens to the very number
   * being read; and no lane holds the other lanes' answers, which a comparison
   * needs. Answers go in blind and the labels are restored from the deal.
   *
   * It takes no arguments: the panel sent the question, so it already knows what
   * was asked, and the answer key -- or a typed override -- carries what the
   * answer should have been. Nothing is retyped to run a grade.
   */
  async judge(): Promise<void> {
    const state = this.store.getSnapshot()
    const { lanes, asked } = state
    const rows = this.rowsFor(state)
    const entries = lanes
      .filter(lane => lane.reading.answer !== undefined)
      .map(lane => ({ key: lane.key, answer: lane.reading.answer as string }))
    if (entries.length === 0 || rows.length === 0 || asked === '') return

    this.set({ judging: true, error: null })
    try {
      const dealt = dealBlind(entries)
      const sessionId = await this.ctx.sessions.create({})
      const conversation = this.ctx.sessions.scope(sessionId)?.get('conversation')
      if (conversation === undefined) throw new Error('judge session has no conversation scope')
      await conversation.send(judgePrompt(asked, rows, dealt))

      const reply = await this.awaitReply(sessionId)
      const { matched, verdicts } = readGrade(reply, rows, dealt)
      if (matched === undefined) {
        // Nothing is marked: every ruling in that reply was measured against an
        // answer the panel cannot name, and an unattributable grade is worse
        // than none.
        this.set({ judging: false, error: 'the grader found no question matching what the lanes were asked' })
        return
      }
      const byKey = new Map(verdicts.map(verdict => [verdict.key, verdict]))
      this.set({
        lanes: this.store.getSnapshot().lanes.map((lane) => {
          const verdict = byKey.get(lane.key)
          return verdict === undefined ? lane : { ...lane, verdict }
        }),
        matched,
        judging: false,
      })
    } catch (error: unknown) {
      this.set({ judging: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Wait for the grading Session's answer.
   *
   * The reply arrives the same way a lane's does -- through the Session list's
   * projections -- so this polls that rather than opening the Session.
   * @param sessionId - the grading Session.
   * @returns its latest turn response.
   */
  private async awaitReply(sessionId: SessionId): Promise<string> {
    const deadline = Date.now() + JUDGE_TIMEOUT_MS
    while (Date.now() < deadline) {
      await new Promise((resolve) => { setTimeout(resolve, JUDGE_POLL_MS) })
      await this.ctx.sessions.refresh()
      const summary = this.ctx.sessions.list.getSnapshot().byId[sessionId]
      const values: Record<string, unknown> = summary?.projectionValues ?? {}
      const outline: readonly unknown[] = Array.isArray(values.turnOutline) ? values.turnOutline : []
      const latest: unknown = outline.at(-1)
      const response: unknown = typeof latest === 'object' && latest !== null
        ? (latest as { response?: unknown }).response
        : undefined
      if (typeof response === 'string' && response.trim() !== '' && summary?.running !== true) return response
    }
    throw new Error('the grader did not answer in time')
  }

  /**
   * Take over one lane in the conversation view.
   *
   * The lane is an ordinary Session, so the full view serves it with its whole
   * transcript, its composer and its tools -- Bridge hands a lane over rather
   * than reimplementing a conversation inside a pane. Leaving the panel does not
   * end the run: the other lanes keep working and report again on return.
   * @param key - the lane to open.
   */
  openLane(key: string): void {
    const lane = this.store.getSnapshot().lanes.find(candidate => candidate.key === key)
    if (lane?.sessionId === undefined) return
    this.ctx.sessions.open(lane.sessionId)
    this.ctx.layout.selectPanel(null)
  }
}
