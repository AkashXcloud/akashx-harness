import type { ChartCardModel } from '../models/chart-card-model.ts'
import { chartNumbers } from '../models/chart-card-model.ts'
import css from './ChartCard.module.css'

const WIDTH = 520
const HEIGHT = 220
const PADDING = 24
const COLORS = ['var(--dsw-alias-link)', 'var(--dsw-alias-state-warn-primary)', 'var(--dsw-static-blue-500)', 'var(--dsw-static-green-500)'] as const

interface Props {
  model: ChartCardModel
  label: string
}

function pointY(value: number, min: number, max: number): number {
  return HEIGHT - PADDING - ((value - min) / (max - min || 1)) * (HEIGHT - PADDING * 2)
}

export function ChartCard({ model, label }: Props) {
  const series = model.valueColumns.map((column, index) => ({
    column,
    values: chartNumbers(model, column),
    color: COLORS[index % COLORS.length] ?? COLORS[0],
  }))
  const values = series.flatMap(item => item.values).filter((value): value is number => value !== null)
  const min = Math.min(0, ...values)
  const max = Math.max(1, ...values)
  const x = (index: number) => PADDING + index * ((WIDTH - PADDING * 2) / Math.max(model.rows.length - 1, 1))
  const isBar = model.type === 'bar'
  const isPie = model.type === 'pie'
  return (
    <figure className={css.root} aria-label={label}>
      {model.title !== undefined && <figcaption className={css.title}>{model.title}</figcaption>}
      <svg className={css.svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
        <line x1={PADDING} x2={WIDTH - PADDING} y1={HEIGHT - PADDING} y2={HEIGHT - PADDING} className={css.axis} />
        {isPie
          ? <PieSeries series={series[0]} />
          : series.map(item => isBar
            ? <BarSeries key={item.column} item={item} model={model} min={min} max={max} x={x} />
            : <PathSeries key={item.column} item={item} min={min} max={max} x={x} area={model.type === 'area'} />)}
      </svg>
      <div className={css.legend}>
        {series.map(item => <span key={item.column}><i style={{ background: item.color }} />{item.column}</span>)}
      </div>
    </figure>
  )
}

function BarSeries({ item, model, min, max, x }: {
  item: { column: string; values: readonly (number | null)[]; color: string }
  model: ChartCardModel
  min: number
  max: number
  x: (index: number) => number
}) {
  const width = Math.max(4, (WIDTH - PADDING * 2) / Math.max(model.rows.length, 1) / Math.max(model.valueColumns.length, 1) - 3)
  return <>{item.values.map((value, index) => value === null ? null : <rect key={index} x={x(index) - width / 2} y={pointY(value, min, max)} width={width} height={HEIGHT - PADDING - pointY(value, min, max)} fill={item.color} rx="3" />)}</>
}

function PathSeries({ item, min, max, x, area }: {
  item: { column: string; values: readonly (number | null)[]; color: string }
  min: number
  max: number
  x: (index: number) => number
  area: boolean
}) {
  const points = item.values.flatMap((value, index) => value === null ? [] : [`${x(index)},${pointY(value, min, max)}`])
  if (points.length === 0) return null
  const path = points.join(' ')
  return <polyline points={path} fill={area ? item.color : 'none'} fillOpacity={area ? 0.18 : undefined} stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
}

function PieSeries({ series }: { series: { values: readonly (number | null)[]; color: string } | undefined }) {
  if (series === undefined) return null
  const total = series.values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
  if (total <= 0) return null
  let offset = 0
  return <>{series.values.map((value, index) => {
    const portion = (value ?? 0) / total
    const start = offset
    offset += portion
    const end = offset
    const large = portion > 0.5 ? 1 : 0
    const point = (fraction: number) => [
      260 + 76 * Math.cos(fraction * Math.PI * 2 - Math.PI / 2),
      110 + 76 * Math.sin(fraction * Math.PI * 2 - Math.PI / 2),
    ]
    const [sx, sy] = point(start)
    const [ex, ey] = point(end)
    return portion === 0 ? null : <path key={index} d={`M 260 110 L ${sx} ${sy} A 76 76 0 ${large} 1 ${ex} ${ey} Z`} fill={index === 0 ? series.color : COLORS[index % COLORS.length]} />
  })}</>
}
