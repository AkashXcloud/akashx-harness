/**
 * AkashX Bridge, browser half: one question fanned across several mode-locked
 * Sessions, watched side by side.
 *
 * A Session is seated on exactly one preset and a subagent inherits its
 * parent's composition, so a single Session cannot exercise several retrieval
 * paths — comparing them means running several Sessions. Bridge is the surface
 * that makes that practical: it spawns a Session per lane, fans one prompt to
 * all of them, and shows what each one answered beside what it cost.
 *
 * Every lane is an ordinary Session. Steering one, or leaving Bridge to
 * continue in the full conversation view, needs no special path back.
 *
 * @module @akashx/akx-client-ui-bridge/client
 */

// Type-only: pulls the Session Controller service merge (ctx.sessions).
import type {} from '@akashx/akx-api-session-controller/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@akashx/akx-client-locale/client'
// Type-only: pulls the layout service merge (ctx.layout) and the 'main' slot.
import type {} from '@akashx/akx-client-ui-layout/client'
// Type-only: pulls the slot registry service merge (ctx.slots).
import type {} from '@akashx/akx-client-ui-renderer/client'
// Type-only: pulls the sidebar's SlotMap merge (the 'sidebar.panellist' entry).
import type {} from '@akashx/akx-client-ui-sidebar/client'
import type { Context as ClientContext } from '@akashx/cordis'
import { BridgeIcon } from './BridgeIcon.tsx'
import { BridgePanel } from './BridgePanel.tsx'
import { BridgeLaneController } from './lane-store.ts'
import { en, type BridgeKey } from './locales.ts'

declare module '@akashx/akx-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Bridge panel copy. */
    'bridge': BridgeKey
  }
}

export type { BridgePanelInjected, BridgePanelProps } from './BridgePanel.tsx'
export type { BridgeLane, BridgeMode, BridgeState } from './lane-store.ts'

/** Required services (cordis fiber inject). */
export const inject = [
  'slots', 'locale', 'sessions', 'layout', 'remote', 'remote.agentPresets',
  // A lane sends through its own Session scope's conversation service, and the
  // context proxy refuses an undeclared name.
  'conversation',
]

/** The panel key, shared by the rail entry and the main occupant. */
const BRIDGE_PANEL = 'bridge'

/**
 * Mount the Bridge rail entry and its main panel.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('bridge', { en }), 'ui-bridge: dictionaries')

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: BRIDGE_PANEL,
    // A function, not a string: the sidebar re-resolves the label on every locale
    // change, so this reads the active language rather than the one at mount.
    label: () => ctx.locale.bind('bridge')('panel.label'),
    order: 20,
    locale: 'bridge',
  }, BridgeIcon))

  const lanes = new BridgeLaneController(ctx)
  // The roster is a live directory, so a preset added or retired while Bridge is
  // open changes what a new lane may be opened on.
  void lanes.loadModes()
  // One subscription feeds every lane: the Session list is where a Session the
  // client has not opened reports its projections.
  ctx.effect(() => ctx.sessions.list.subscribe(() => { lanes.refresh() }), 'ui-bridge: lane readings')
  ctx.effect(() => ctx.on('connection/reset', () => { void lanes.loadModes() }), 'ui-bridge: roster refresh')

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: BRIDGE_PANEL,
    locale: 'bridge',
    inject: () => ({
      addLane: (modeId: string) => { void lanes.addLane(modeId) },
      removeLane: (key: string) => { lanes.removeLane(key) },
      ask: (text: string) => { void lanes.ask(text) },
      focus: (key: string | null) => { lanes.focus(key) },
      changeMode: (key: string, modeId: string) => { void lanes.changeMode(key, modeId) },
      hooks: { bridge: lanes.store },
    }),
  }, BridgePanel))
}
