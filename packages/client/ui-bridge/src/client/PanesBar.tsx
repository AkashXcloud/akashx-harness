/** Controls above the pane grid: one question for every lane, and the grade. */
import { useState } from 'react'
import { IconPlusOutline16 } from '@akashx/akx-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@akashx/akx-client-ui-slots'
import type { ObservableSnapshot } from '@akashx/akx-client-store'
import type { BridgeMode, BridgeState } from './lane-store.ts'
import css from './BridgePanel.module.css'

/** Everything the bar needs that is not a slot child. */
export interface PanesBarInjected {
  /** Open one lane on the given mode. */
  addLane: (modeId: string) => void
  /** Send one prompt to every lane, or to the focused lane alone. */
  ask: (text: string) => void
  /** Set the answer the grader marks against. */
  setGold: (gold: string) => void
  /** Grade every answered lane against the correct answer. */
  judge: () => void
  /** Leave pane mode for the single current-Session view. */
  closePanes: () => void
  /** Private reactive sources bound to framework selector hooks. */
  hooks: { bridge: ObservableSnapshot<BridgeState> }
}

/** Props the panes bar renders from. */
export type PanesBarProps =
  PropsRuntime<'conversation.panes.bar'> & InjectFace<PanesBarInjected> & PropsLocale<'bridge'>

/** The add control: pick a mode, get a lane on it. */
function AddLane({ modes, addLane, t }: {
  modes: readonly BridgeMode[]
  addLane: (modeId: string) => void
  t: PanesBarProps['t']
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

/** One box for every lane, or for the one being steered. */
function Composer({ focusedName, ask, t }: {
  focusedName: string | undefined
  ask: (text: string) => void
  t: PanesBarProps['t']
}) {
  const [text, setText] = useState('')
  const submit = () => {
    const trimmed = text.trim()
    if (trimmed === '') return
    ask(trimmed)
    setText('')
  }
  return (
    <div className={css.barComposer} data-bridge-composer>
      <textarea
        className={css.composerInput}
        value={text}
        rows={1}
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

/**
 * Render the bar above the panes.
 *
 * @param props - the live panel snapshot, the lane actions, and the locale seat.
 * @returns the bar, or nothing while no lane is open.
 */
export function PanesBar({ useBridge, addLane, ask, setGold, judge, closePanes, t }: PanesBarProps) {
  const state = useBridge(snapshot => snapshot)
  const focusedLane = state.lanes.find(lane => lane.key === state.focused)
  const focusedName = focusedLane === undefined
    ? undefined
    : state.modes.find(mode => mode.id === focusedLane.modeId)?.name ?? focusedLane.modeId
  // Every lane, not any: a grade run before the last answer lands silently
  // omits that lane, and an ungraded lane beside graded ones reads as a failure.
  const canJudge = state.lanes.length > 0 && state.lanes.every(lane => lane.reading.answer !== undefined)
  // The grader matches the question against the key itself, so a deployment with
  // a key needs nothing typed. Without one, the answer is asked for.
  const typed = state.gold.trim() !== ''
  const gradable = canJudge && state.asked !== '' && (state.hasKey || typed)
  return (
    <div className={css.bar} data-bridge-panel>
      <div className={css.barHead}>
        <span className={css.title}>{t('panel.title')}</span>
        <span className={css.subtitle}>{t('panel.subtitle')}</span>
        <span className={css.spacer} />
        <AddLane modes={state.modes} addLane={addLane} t={t} />
        <button type="button" className={css.add} onClick={closePanes}>{t('panes.close')}</button>
      </div>
      <div className={css.barRow}>
        <Composer focusedName={focusedName} ask={ask} t={t} />
        <div className={css.judgeBar} data-bridge-judge>
          {state.hasKey && !typed
            ? (
              <span className={css.judgeKeyed} data-bridge-judge-keyed>
                {state.matched === undefined
                  ? t('judge.keyed')
                  : t('judge.matched', { question: state.matched.question })}
              </span>
            )
            : (
              <input
                className={css.judgeInput}
                value={state.gold}
                placeholder={t('judge.gold')}
                onChange={(event) => { setGold(event.target.value) }}
              />
            )}
          <button
            type="button"
            className={css.composerSend}
            title={state.asked === '' ? t('judge.unasked') : state.asked}
            disabled={state.judging || !gradable}
            onClick={judge}
          >
            {state.judging ? t('judge.running') : t('judge.run')}
          </button>
        </div>
      </div>
    </div>
  )
}
