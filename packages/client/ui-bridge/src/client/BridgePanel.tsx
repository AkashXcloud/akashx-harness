/** Root-scoped main occupant: the Bridge lane grid and its shared composer. */
import { useState } from 'react'
import { IconCloseOutline16, IconPlusOutline16 } from '@akashx/akx-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@akashx/akx-client-ui-slots'
import type { ObservableSnapshot } from '@akashx/akx-client-store'
import type { BridgeLane, BridgeMode, BridgeState } from './lane-store.ts'
import css from './BridgePanel.module.css'

/** Everything the panel needs that is not a slot child. */
export interface BridgePanelInjected {
  /** Open one lane on the given mode. */
  addLane: (modeId: string) => void
  /** Drop one lane from the panel. */
  removeLane: (key: string) => void
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

/** One lane column: which mode it runs and how far it got. */
function Lane({ lane, modes, removeLane, t }: {
  lane: BridgeLane
  modes: readonly BridgeMode[]
  removeLane: (key: string) => void
  t: BridgePanelProps['t']
}) {
  const name = modes.find(mode => mode.id === lane.modeId)?.name ?? lane.modeId ?? ''
  return (
    <section className={css.lane} data-bridge-lane={lane.key}>
      <header className={css.laneHead}>
        <span className={css.laneMode}>{name}</span>
        <button
          type="button"
          className={css.laneClose}
          aria-label={t('lane.remove')}
          onClick={() => { removeLane(lane.key) }}
        >
          <IconCloseOutline16 size={12} />
        </button>
      </header>
      <div className={css.laneBody}>
        <span className={css.laneStatus} data-status={lane.status}>
          {lane.status === 'spawning' ? t('lane.spawning') : lane.error ?? t('lane.ready')}
        </span>
      </div>
    </section>
  )
}

/**
 * Render the Bridge panel.
 * @param props - the live panel snapshot, its lane actions, and the locale seat.
 * @returns the lane grid, or its empty state while no lane is open.
 */
export function BridgePanel({ useBridge, addLane, removeLane, t }: BridgePanelProps) {
  const state = useBridge(snapshot => snapshot)
  return (
    <div className={css.root} data-bridge-panel>
      <div className={css.header}>
        <span className={css.title}>{t('panel.title')}</span>
        <span className={css.subtitle}>{t('panel.subtitle')}</span>
        <span className={css.spacer} />
        <AddLane modes={state.modes} addLane={addLane} t={t} />
      </div>
      {state.lanes.length === 0
        ? (
          <div className={css.empty}>
            <span>{t('panel.empty')}</span>
            <AddLane modes={state.modes} addLane={addLane} t={t} />
          </div>
        )
        : (
          <div className={css.lanes} data-bridge-lanes>
            {state.lanes.map(lane => (
              <Lane key={lane.key} lane={lane} modes={state.modes} removeLane={removeLane} t={t} />
            ))}
          </div>
        )}
    </div>
  )
}
