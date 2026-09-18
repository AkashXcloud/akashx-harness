/** Root-scoped main occupant: the Bridge lane grid and its shared composer. */
import { useState } from 'react'
import {
  IconBranchOutline16, IconCloseOutline16, IconPlusOutline16, IconRightUpOutline16,
} from '@akashx/akx-client-ui-primitives'
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
  /** Leave the panel and continue one lane in the conversation view. */
  openLane: (key: string) => void
  /** Reseat one lane on a different mode, before it has run. */
  changeMode: (key: string, modeId: string) => void
  /** Set the answer the grader marks against. */
  setGold: (gold: string) => void
  /** Grade every answered lane against the gold answer. */
  judge: (question: string) => void
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

/** Compact token count: exact under a thousand, one decimal above.
 *
 * A lane that has answered reports a real zero rather than a dash: a retrieval
 * path that spends nothing at the deployment is a finding, not missing data. */
function formatTokens(value: number, settled: boolean): string {
  if (value === 0) return settled ? '0' : '—'
  return value < 1000 ? String(value) : `${(value / 1000).toFixed(1)}K`
}

/** Elapsed wall time; a turn that has not closed reports nothing rather than zero. */
function formatElapsed(ms: number): string {
  if (ms === 0) return '—'
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`
}

/** One figure in a lane's footer. */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className={css.metric}>
      <span className={css.metricLabel}>{label}</span>
      <span className={css.metricValue}>{value}</span>
    </span>
  )
}

/** One lane column: which mode it runs and how far it got. */
function Lane({ lane, modes, focused, removeLane, focus, openLane, changeMode, t }: {
  lane: BridgeLane
  modes: readonly BridgeMode[]
  focused: string | null
  removeLane: (key: string) => void
  focus: (key: string | null) => void
  openLane: (key: string) => void
  changeMode: (key: string, modeId: string) => void
  t: BridgePanelProps['t']
}) {
  const [picking, setPicking] = useState(false)
  const name = modes.find(mode => mode.id === lane.modeId)?.name ?? lane.modeId ?? ''
  const steering = focused === lane.key
  // A Session that has run cannot be recomposed, so the mode stops being a choice
  // once the lane has answered -- the same rule that keeps the comparison honest.
  const settled = lane.reading.answer !== undefined || lane.reading.running
  return (
    <section className={css.lane} data-bridge-lane={lane.key} data-steering={steering || undefined}>
      <header className={css.laneHead}>
        <span className={css.laneModeWrap}>
          <button
            type="button"
            className={css.laneMode}
            disabled={settled || lane.status !== 'ready'}
            title={settled ? t('lane.modeLocked') : t('lane.modeChange')}
            aria-expanded={picking}
            onClick={() => { setPicking(!picking) }}
          >
            {name}
          </button>
          {picking && (
            <ul className={css.addMenu} role="menu">
              {modes.map(mode => (
                <li key={mode.id}>
                  <button
                    type="button"
                    role="menuitem"
                    className={css.addMenuItem}
                    onClick={() => { changeMode(lane.key, mode.id); setPicking(false) }}
                  >
                    {mode.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </span>
        <button
          type="button"
          className={css.laneSteer}
          aria-pressed={steering}
          title={steering ? t('lane.unfocus') : t('lane.focus')}
          onClick={() => { focus(steering ? null : lane.key) }}
        >
          <IconBranchOutline16 size={12} />
        </button>
        {lane.verdict !== undefined && (
          <span
            className={css.verdict}
            data-correct={lane.verdict.correct || undefined}
            title={lane.verdict.reason ?? ''}
          >
            {lane.verdict.correct ? t('verdict.correct') : t('verdict.incorrect')}
          </span>
        )}
        <button
          type="button"
          className={css.laneSteer}
          disabled={lane.sessionId === undefined}
          aria-label={t('lane.open')}
          title={t('lane.open')}
          onClick={() => { openLane(lane.key) }}
        >
          <IconRightUpOutline16 size={12} />
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
        {lane.error !== undefined
          ? <span className={css.laneStatus} data-status="failed">{lane.error}</span>
          : lane.reading.answer !== undefined
            ? <p className={css.laneAnswer}>{lane.reading.answer}</p>
            : (
              <span className={css.laneStatus} data-status={lane.status}>
                {lane.status === 'spawning'
                  ? t('lane.spawning')
                  : lane.reading.running ? t('lane.running') : t('lane.ready')}
              </span>
            )}
      </div>
      <footer className={css.laneFoot}>
        <Metric label={t('metric.harness')} value={formatTokens(lane.reading.workingTokens, settled)} />
        <Metric label={t('metric.database')} value={formatTokens(lane.reading.databaseTokens, settled)} />
        <Metric label={t('metric.elapsed')} value={formatElapsed(lane.reading.elapsedMs)} />
      </footer>
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

/** The grading row: the known-good answer, and the control that marks against it. */
function JudgeBar({ gold, judging, canJudge, setGold, judge, t }: {
  gold: string
  judging: boolean
  canJudge: boolean
  setGold: (gold: string) => void
  judge: (question: string) => void
  t: BridgePanelProps['t']
}) {
  const [question, setQuestion] = useState('')
  return (
    <div className={css.judgeBar} data-bridge-judge>
      <input
        className={css.judgeInput}
        value={question}
        placeholder={t('judge.question')}
        onChange={(event) => { setQuestion(event.target.value) }}
      />
      <input
        className={css.judgeInput}
        value={gold}
        placeholder={t('judge.gold')}
        onChange={(event) => { setGold(event.target.value) }}
      />
      <button
        type="button"
        className={css.composerSend}
        disabled={judging || !canJudge || gold.trim() === ''}
        onClick={() => { judge(question) }}
      >
        {judging ? t('judge.running') : t('judge.run')}
      </button>
    </div>
  )
}

export function BridgePanel({
  useBridge, addLane, removeLane, ask, focus, openLane, changeMode, setGold, judge, t,
}: BridgePanelProps) {
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
                openLane={openLane}
                changeMode={changeMode}
                t={t}
              />
            ))}
          </div>
        )}
      {state.lanes.length > 0 && (
        <>
          <JudgeBar
            gold={state.gold}
            judging={state.judging}
            canJudge={state.lanes.some(lane => lane.reading.answer !== undefined)}
            setGold={setGold}
            judge={judge}
            t={t}
          />
          <Composer focusedName={focusedName} ask={ask} t={t} />
        </>
      )}
    </div>
  )
}
