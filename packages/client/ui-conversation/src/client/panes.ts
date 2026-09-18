/**
 * Several conversations on screen at once.
 *
 * The conversation surface normally shows the current Session, because there is
 * one stage and `current` occupies it. A comparison needs more than one at a
 * time: the same question in several Sessions, each running its own
 * composition, watched together.
 *
 * Pane mode is a list of Session ids held beside the current one. Every pane is
 * the ordinary conversation subtree re-rendered under that Session's scope
 * binding, so a pane streams exactly what the single view streams — the same
 * transcript, the same tool cards, the same composer — with nothing
 * reimplemented and nothing to keep in step.
 *
 * The owner of the list is whichever feature is running the comparison; this
 * module only holds it, holds each Session's window open while it is shown,
 * and tells the panel what to render.
 *
 * @module @akashx/akx-client-ui-conversation/panes
 */

import { createSnapshotStore, type SnapshotStore } from '@akashx/akx-client-store'
import type { ISessions } from '@akashx/akx-api-session-controller/client'
import type { SessionId } from '@akashx/akx-session/types'

/** Pane-mode state: the panes on screen, or `undefined` for the single view. */
export interface PaneState {
  /** Sessions shown side by side; an empty list is pane mode with no panes yet. */
  readonly panes: readonly SessionId[] | undefined
}

/**
 * Holds the pane list and the Session holds that keep each pane's window open.
 *
 * A pane shows a Session without making it current, and staging is the open
 * signal, so every pane is held for as long as it is shown. Releasing on
 * replacement is what stops a closed pane from keeping its window and scope
 * alive forever.
 */
export class ConversationPanes {
  readonly store: SnapshotStore<PaneState> = createSnapshotStore<PaneState>({ panes: undefined })
  private held = new Map<SessionId, () => void>()

  /** @param sessions - the Session Controller object layer that grants holds. */
  constructor(private readonly sessions: ISessions) {}

  /**
   * Enter, update, or leave pane mode.
   *
   * @param panes - the Sessions to show side by side, or `undefined` to return
   * to the single current-Session view.
   */
  set(panes: readonly SessionId[] | undefined): void {
    const next = new Map<SessionId, () => void>()
    for (const id of panes ?? []) {
      const existing = this.held.get(id)
      if (existing !== undefined) {
        this.held.delete(id)
        next.set(id, existing)
        continue
      }
      // A pane listed twice holds once: the second entry shares the first's
      // hold, and the release runs when the list stops naming it at all.
      if (!next.has(id)) next.set(id, this.sessions.hold(id))
    }
    for (const release of this.held.values()) release()
    this.held = next
    this.store.set({ panes: panes === undefined ? undefined : [...panes] })
  }

  /** Release every hold; the panel is going away. */
  dispose(): void {
    for (const release of this.held.values()) release()
    this.held = new Map()
    this.store.set({ panes: undefined })
  }
}
