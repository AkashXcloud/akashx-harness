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
  /** Send one prompt to every lane, or to the focused lane alone. */
  ask: (text: string) => void
  /** Address the composer at one lane, or at every lane. */
  focus: (key: string | null) => void
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
function Lane({ lane, modes, focused, removeLane, focus, t }: {
  lane: BridgeLane
  modes: readonly BridgeMode[]
  focused: string | null
  removeLane: (key: string) => void
  focus: (key: string | null) => void
  t: BridgePanelProps['t']
}) {
  const name = modes.find(mode => mode.id === lane.modeId)?.name ?? lane.modeId ?? ''
  const steering = focused === lane.key
  return (
    <section className={css.lane} data-bridge-lane={lane.key} data-steering={steering || undefined}>
      <header className={css.laneHead}>
        <button
          type="button"
          className={css.laneMode}
          aria-pressed={steering}
          title={steering ? t('lane.unfocus') : t('lane.focus')}
          onClick={() => { focus(steering ? null : lane.key) }}
        >
          {name}
        </button>
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
/** One box for every lane, or for the one being steered. */
function Composer({ focusedName, ask, t }: {
  focusedName: string | undefined
  ask: (text: string) => void
  t: BridgePanelProps['t']
}) {
  const [text, setText] = useState('')
  const submit = () => {
    const trimmed = text.trim()
    if (trimmed === '') return
    ask(trimmed)
    setText('')
  }
  return (
    <div className={css.composer} data-bridge-composer>
      <textarea
        className={css.composerInput}
        value={text}
        rows={2}
        placeholder={focusedName === undefined
          ? t('composer.placeholder')
          : t('composer.placeholderFocused', { lane: focusedName })}
        onChange={(event) => { setText(event.target.value) }}
        onKeyDown={(event) => {
          // Enter sends; the modifier keeps a newline, matching the composer a
          // person already knows from the conversation view.
          if (event.key !== 'Enter' || event.shiftKey) return
          event.preventDefault()
          submit()
        }}
      />
      <button type="button" className={css.composerSend} onClick={submit} disabled={text.trim() === ''}>
        {t('composer.send')}
      </button>
    </div>
  )
}

export function BridgePanel({ useBridge, addLane, removeLane, ask, focus, t }: BridgePanelProps) {
  const state = useBridge(snapshot => snapshot)
  const focusedLane = state.lanes.find(lane => lane.key === state.focused)
  const focusedName = focusedLane === undefined
    ? undefined
    : state.modes.find(mode => mode.id === focusedLane.modeId)?.name ?? focusedLane.modeId
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
              <Lane
                key={lane.key}
                lane={lane}
                modes={state.modes}
                focused={state.focused}
                removeLane={removeLane}
                focus={focus}
                t={t}
              />
            ))}
          </div>
        )}
      {state.lanes.length > 0 && <Composer focusedName={focusedName} ask={ask} t={t} />}
    </div>
  )
}
