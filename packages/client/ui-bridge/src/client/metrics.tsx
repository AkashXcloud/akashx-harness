/** The figures a lane reports, and how each one is written. */
import css from './BridgePanel.module.css'

/** Compact token count: exact under a thousand, one decimal above.
 *
 * A lane that has answered reports a real zero rather than a dash: a retrieval
 * path that spends nothing at the deployment is a finding, not missing data.
 *
 * @param value - the token count.
 * @param settled - whether the lane has started or finished a turn.
 * @returns the display string.
 */
export function formatTokens(value: number, settled: boolean): string {
  if (value === 0) return settled ? '0' : '—'
  return value < 1000 ? String(value) : `${(value / 1000).toFixed(1)}K`
}

/** Elapsed wall time; a turn that has not closed reports nothing rather than zero.
 * @param ms - milliseconds of model and tool time.
 * @returns the display string.
 */
export function formatElapsed(ms: number): string {
  if (ms === 0) return '—'
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`
}

/** Money, to the precision a single question needs; unpriced lanes show nothing.
 *
 * An unconfigured rate is missing information, not a free answer, so the dash
 * stays until a rate card covers every model the lane used.
 *
 * @param value - US dollars, or undefined when anything the lane used is unpriced.
 * @returns the display string.
 */
export function formatCost(value: number | undefined): string {
  if (value === undefined) return '—'
  if (value === 0) return '$0'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return value < 1 ? `$${value.toFixed(3)}` : `$${value.toFixed(2)}`
}

/** One figure in a lane's header.
 * @param props - the label, its explanation, and the formatted value.
 * @returns the labelled figure.
 */
export function Metric({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <span className={css.metric} title={hint}>
      <span className={css.metricLabel}>{label}</span>
      <span className={css.metricValue}>{value}</span>
    </span>
  )
}
