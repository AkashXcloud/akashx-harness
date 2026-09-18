/** One pane's own header: which mode it runs, how it was graded, what it spent. */
import { IconBranchOutline16, IconCloseOutline16 } from '@akashx/akx-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@akashx/akx-client-ui-slots'
import type { ObservableSnapshot } from '@akashx/akx-client-store'
import { formatCost, formatElapsed, formatTokens, Metric } from './metrics.tsx'
import type { BridgeState } from './lane-store.ts'
import css from './BridgePanel.module.css'

/** Everything the chrome needs that is not a slot child. */
export interface PaneChromeInjected {
  /** Drop this lane from the comparison. */
  removeLane: (key: string) => void
  /** Address the composer at one lane, or at every lane. */
  focus: (key: string | null) => void
  /** Private reactive sources bound to framework selector hooks. */
  hooks: { bridge: ObservableSnapshot<BridgeState> }
}

/** Props one pane's chrome renders from; `sessionId` is the pane's own Session. */
export type PaneChromeProps =
  PropsRuntime<'conversation.pane.chrome'> & InjectFace<PaneChromeInjected> & PropsLocale<'bridge'>

/**
 * Render one pane's header.
 *
 * The seat is bound to the pane's Session, not to the current one, so the lane
 * is found by Session rather than passed down: a pane whose Session is not a
 * lane renders nothing, which is what a conversation opened beside a
 * comparison should do.
 *
 * @param props - the pane's Session, the lane actions, and the locale seat.
 * @returns the pane header, or nothing when the pane is not a lane.
 */
export function PaneChrome({ sessionId, useBridge, removeLane, focus, t }: PaneChromeProps) {
  const state = useBridge(snapshot => snapshot)
  const lane = state.lanes.find(candidate => candidate.sessionId === sessionId)
  if (lane === undefined) return null
  const name = state.modes.find(mode => mode.id === lane.modeId)?.name ?? lane.modeId ?? ''
  const steering = state.focused === lane.key
  const settled = lane.reading.answer !== undefined || lane.reading.running
  return (
    <header className={css.paneHead} data-bridge-lane={lane.key} data-steering={steering || undefined}>
      <span className={css.laneMode}>{name}</span>
      {lane.verdict !== undefined && (
        <span
          className={css.verdict}
          data-correct={lane.verdict.correct || undefined}
          title={lane.verdict.reason ?? ''}
        >
          {lane.verdict.correct ? t('verdict.correct') : t('verdict.incorrect')}
        </span>
      )}
      <span className={css.spacer} />
      <Metric
        label={t('metric.harness')}
        hint={t('metric.harnessHint')}
        value={formatTokens(lane.reading.workingTokens, settled)}
      />
      <Metric
        label={t('metric.database')}
        hint={t('metric.databaseHint')}
        value={formatTokens(lane.reading.databaseTokens, settled)}
      />
      <Metric
        label={t('metric.cost')}
        hint={t('metric.costHint')}
        value={formatCost(lane.reading.costUsd)}
      />
      <Metric
        label={t('metric.elapsed')}
        hint={t('metric.elapsedHint')}
        value={formatElapsed(lane.reading.elapsedMs)}
      />
      <button
        type="button"
        className={css.laneSteer}
        aria-pressed={steering}
        title={steering ? t('lane.unfocus') : t('lane.focus')}
        onClick={() => { focus(steering ? null : lane.key) }}
      >
        <IconBranchOutline16 size={12} />
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
  )
}
