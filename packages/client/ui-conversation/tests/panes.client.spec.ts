/**
 * Pane holds: a Session is held for exactly as long as a pane shows it. The
 * holds are what open a pane's history window, and a hold that outlives its
 * pane keeps a window and a scope alive for the life of the session.
 */

import { describe, expect, it } from 'vitest'
import type { ISessions } from '@akashx/akx-api-session-controller/client'
import type { SessionId } from '@akashx/akx-session/types'
import { ConversationPanes } from '../src/client/panes.ts'

const id = (value: string): SessionId => value as SessionId

/** A Sessions face that records only what pane holds do to it. */
function fakeSessions(held: string[]): ISessions {
  return {
    hold: (target: SessionId) => {
      held.push(`hold ${target}`)
      return () => { held.push(`release ${target}`) }
    },
  } as unknown as ISessions
}

describe('ConversationPanes', () => {
  it('holds every pane it shows and publishes the list', () => {
    const held: string[] = []
    const panes = new ConversationPanes(fakeSessions(held))
    panes.set([id('a'), id('b')])

    expect(held).toEqual(['hold a', 'hold b'])
    expect(panes.store.getSnapshot().panes).toEqual(['a', 'b'])
  })

  it('keeps a pane that stays and releases only the one that left', () => {
    const held: string[] = []
    const panes = new ConversationPanes(fakeSessions(held))
    panes.set([id('a'), id('b')])
    held.length = 0
    panes.set([id('a'), id('c')])

    // `a` is not re-held: re-holding would open a second window for a pane that
    // never went away.
    expect(held).toEqual(['hold c', 'release b'])
  })

  it('holds a Session named twice only once', () => {
    const held: string[] = []
    const panes = new ConversationPanes(fakeSessions(held))
    panes.set([id('a'), id('a')])

    expect(held).toEqual(['hold a'])
    expect(panes.store.getSnapshot().panes).toEqual(['a', 'a'])
  })

  it('releases everything when it leaves pane mode', () => {
    const held: string[] = []
    const panes = new ConversationPanes(fakeSessions(held))
    panes.set([id('a'), id('b')])
    held.length = 0
    panes.set(undefined)

    expect(held).toEqual(['release a', 'release b'])
    expect(panes.store.getSnapshot().panes).toBeUndefined()
  })

  it('enters pane mode with no panes yet', () => {
    const held: string[] = []
    const panes = new ConversationPanes(fakeSessions(held))
    panes.set([])

    // An empty list is pane mode, not the single view: the bar is laid out and
    // the first lane lands beside it.
    expect(panes.store.getSnapshot().panes).toEqual([])
    expect(held).toEqual([])
  })

  it('releases every hold when the panel goes away', () => {
    const held: string[] = []
    const panes = new ConversationPanes(fakeSessions(held))
    panes.set([id('a')])
    held.length = 0
    panes.dispose()

    expect(held).toEqual(['release a'])
    expect(panes.store.getSnapshot().panes).toBeUndefined()
  })

  it('copies the list it was given', () => {
    const panes = new ConversationPanes(fakeSessions([]))
    const given = [id('a')]
    panes.set(given)
    given.push(id('b'))

    expect(panes.store.getSnapshot().panes).toEqual(['a'])
  })
})
