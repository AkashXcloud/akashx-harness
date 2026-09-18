/** Root-scoped main occupant: where a comparison is started, before it becomes panes. */
import { useState } from 'react'
import { IconPlusOutline16 } from '@akashx/akx-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@akashx/akx-client-ui-slots'
import type { ObservableSnapshot } from '@akashx/akx-client-store'
import type { BridgeMode, BridgeState } from './lane-store.ts'
import css from './BridgePanel.module.css'

/** Everything the panel needs that is not a slot child. */
export interface BridgePanelInjected {
  /** Open one lane on the given mode. */
  addLane: (modeId: string) => void
  /** Show the open lanes as conversation panes. */
  showPanes: () => void
  /** Private reactive sources bound to framework selector hooks. */
  hooks: { bridge: ObservableSnapshot<BridgeState> }
}

/** Props the Bridge main panel renders from. */
export type BridgePanelProps =
  PropsRuntime<'main'> & InjectFace<BridgePanelInjected> & PropsLocale<'bridge'>

/** The add control: pick a mode, get a lane on it. */
function AddLane({ modes, addLane, t }: {
  modes: readonly BridgeMode[]
  addLane: (modeId: string) => void
  t: BridgePanelProps['t']
}) {
  const [open, setOpen] = useState(false)
  if (modes.length === 0) return null
  return (
    <span className={css.addWrap}>
      <button type="button" className={css.add} onClick={() => { setOpen(!open) }} aria-expanded={open}>
        <IconPlusOutline16 size={14} />
        {t('lane.add')}
      </button>
      {open && (
        <ul className={css.addMenu} role="menu">
          {modes.map(mode => (
            <li key={mode.id}>
              <button
                type="button"
                role="menuitem"
                className={css.addMenuItem}
                onClick={() => { addLane(mode.id); setOpen(false) }}
              >
                {mode.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

/**
 * Render the Bridge starter.
 *
 * Opening a lane hands the screen to the conversation surface, where every lane
 * is a pane running its own Session: a comparison is watched as conversations,
 * not as summaries of them. This panel is what is left behind — the way in, and
 * the way back when someone navigates away from the panes.
 *
 * @param props - the live panel snapshot, the lane actions, and the locale seat.
 * @returns the starter, or the way back to the panes.
 */
export function BridgePanel({ useBridge, addLane, showPanes, t }: BridgePanelProps) {
  const state = useBridge(snapshot => snapshot)
  return (
    <div className={css.root} data-bridge-panel>
      <div className={css.header}>
        <span className={css.title}>{t('panel.title')}</span>
        <span className={css.subtitle}>{t('panel.subtitle')}</span>
        <span className={css.spacer} />
        <AddLane modes={state.modes} addLane={addLane} t={t} />
      </div>
      <div className={css.empty}>
        {state.lanes.length === 0
          ? (
            <>
              <span>{t('panel.empty')}</span>
              <AddLane modes={state.modes} addLane={addLane} t={t} />
            </>
          )
          : (
            <>
              <span>{t('panes.running', { count: String(state.lanes.length) })}</span>
              <button type="button" className={css.add} onClick={showPanes}>{t('panes.open')}</button>
            </>
          )}
      </div>
    </div>
  )
}
