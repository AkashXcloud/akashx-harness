/**
 * The lane controller's timing and hand-off: a lane's answer reaches the panel
 * only because asking starts a poll over the Session list, the poll keeps
 * reading after the last answer so the deployment spend lands beside it, and a
 * lane can be handed to the conversation view once it has a Session.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@akashx/cordis'
import { BridgeLaneController } from '../src/client/lane-store.ts'

/** One turn as the Session list serves it. */
interface Row {
  running: boolean
  projectionValues: { turnOutline?: unknown }
}

/** What a bench records and lets a spec steer. */
interface Bench {
  /** Session rows the list serves, by Session id. */
  rows: Map<string, Row>
  /** How many times the controller re-read the list. */
  refreshes: number
  /** Sessions handed to the conversation view. */
  opened: string[]
  /** Panel selections, so leaving the panel is observable. */
  panels: (string | null)[]
  /** Called on every refresh, to land an answer at a chosen tick. */
  onRefresh?: (count: number) => void
}

const answered = (response: string): Row => ({
  running: false,
  projectionValues: { turnOutline: [{ turn: 1, seq: 4, prompt: 'q', response }] },
})

const working = (): Row => ({ running: true, projectionValues: { turnOutline: [] } })

/**
 * A client context over an in-memory Session list.
 * @param bench - the recorder the spec reads and steers.
 * @returns the fake plugin context the controller runs on.
 */
function fakeCtx(bench: Bench): ClientContext {
  let nextSession = 0
  // The real list notifies its subscribers when a re-read lands, which is what
  // republishes the lanes; a fake that only served rows would never let the poll
  // see the answer it was waiting for.
  let notify: (() => void) | undefined
  return {
    sessions: {
      list: {
        getSnapshot: () => ({ byId: Object.fromEntries(bench.rows) }),
        subscribe: (listener: () => void) => { notify = listener; return () => { notify = undefined } },
      },
      refresh: () => {
        bench.refreshes += 1
        bench.onRefresh?.(bench.refreshes)
        notify?.()
        return Promise.resolve()
      },
      create: () => {
        const id = `session-${nextSession += 1}`
        bench.rows.set(id, working())
        return Promise.resolve(id)
      },
      scope: () => ({ get: () => ({ send: () => Promise.resolve() }) }),
      open: (id: string) => { bench.opened.push(id) },
    },
    remote: {
      agentPresets: {
        list: () => Promise.resolve({ ok: true, value: { presets: [{ id: 'tree', name: 'Concept Tree only' }] } }),
        select: () => Promise.resolve({ ok: true, value: {} }),
      },
    },
    layout: { selectPanel: (panel: string | null) => { bench.panels.push(panel) } },
  } as unknown as ClientContext
}

const newBench = (): Bench => ({ rows: new Map(), refreshes: 0, opened: [], panels: [] })

/**
 * A controller with one ready lane.
 * @param bench - the bench the controller runs against.
 * @returns the controller, ready to be asked.
 */
async function withLane(bench: Bench): Promise<BridgeLaneController> {
  const ctx = fakeCtx(bench)
  const lanes = new BridgeLaneController(ctx)
  // The panel wires this subscription; the controller reads its own lanes back
  // through it, so a bench without it never observes an answer.
  ctx.sessions.list.subscribe(() => { lanes.refresh() })
  await lanes.addLane('tree')
  return lanes
}

describe('answer poll', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('reads the list until the lane answers, then through the grace window', async () => {
    const bench = newBench()
    // The list serves an empty response until the fourth read: the row is built
    // while the turn is still being handled, so the answer is not in the first one.
    bench.onRefresh = (count) => {
      if (count === 4) bench.rows.set('session-1', answered('$32,765 million'))
    }
    const lanes = await withLane(bench)
    await lanes.ask('what was the revenue')

    await vi.advanceTimersByTimeAsync(3000 * 4)
    expect(bench.refreshes).toBe(4)
    expect(lanes.store.getSnapshot().lanes[0]?.reading.answer).toBe('$32,765 million')

    // Six further reads, because the deployment spend is written behind the answer.
    await vi.advanceTimersByTimeAsync(3000 * 6)
    expect(bench.refreshes).toBe(10)

    await vi.advanceTimersByTimeAsync(3000 * 10)
    expect(bench.refreshes).toBe(10)
  })

  it('gives up on a lane that never answers', async () => {
    const bench = newBench()
    const lanes = await withLane(bench)
    await lanes.ask('what was the revenue')

    await vi.advanceTimersByTimeAsync(3000 * 200)
    expect(bench.refreshes).toBe(100)
  })

  it('replaces a running poll rather than racing it', async () => {
    const bench = newBench()
    const lanes = await withLane(bench)
    await lanes.ask('first')
    await vi.advanceTimersByTimeAsync(3000 * 2)
    await lanes.ask('second')

    await vi.advanceTimersByTimeAsync(3000 * 2)
    // Four reads in all: two from each question, never four from two overlapping polls.
    expect(bench.refreshes).toBe(4)
  })

  it('stops when the panel goes away', async () => {
    const bench = newBench()
    const lanes = await withLane(bench)
    await lanes.ask('what was the revenue')
    await vi.advanceTimersByTimeAsync(3000)
    lanes.stop()

    await vi.advanceTimersByTimeAsync(3000 * 10)
    expect(bench.refreshes).toBe(1)
  })
})

describe('handing a lane over', () => {
  it('opens the lane and leaves the panel', async () => {
    const bench = newBench()
    const lanes = await withLane(bench)
    lanes.openLane(lanes.store.getSnapshot().lanes[0]?.key ?? '')

    expect(bench.opened).toEqual(['session-1'])
    expect(bench.panels).toEqual([null])
  })

  it('opens nothing for a lane whose Session does not exist yet', () => {
    const bench = newBench()
    const lanes = new BridgeLaneController(fakeCtx(bench))
    void lanes.addLane('tree')
    lanes.openLane(lanes.store.getSnapshot().lanes[0]?.key ?? '')

    expect(bench.opened).toEqual([])
    expect(bench.panels).toEqual([])
  })
})
