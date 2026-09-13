/** Pure projection of Cognate chart presentation metadata into a safe SVG model. */
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-chat/client'

export interface ChartCardModel {
  type: 'bar' | 'line' | 'area' | 'pie' | 'scatter'
  title?: string
  labelColumn: string
  valueColumns: readonly string[]
  rows: readonly Record<string, unknown>[]
}

const CHART_TYPES = new Set<ChartCardModel['type']>(['bar', 'line', 'area', 'pie', 'scatter'])

/** Read chart metadata persisted on a settled `render_chart` result. */
export function chartCardModel(toolName: string, block: ToolCallBlock): ChartCardModel | null {
  if (toolName !== 'render_chart' || !('kind' in block) || block.meta === undefined || block.meta === null) return null
  if (typeof block.meta !== 'object' || Array.isArray(block.meta)) return null
  const meta = block.meta as Record<string, unknown>
  const type = meta.type
  const labelColumn = meta.label_column
  const valueColumns = meta.value_columns
  const rows = meta.rows
  if (typeof type !== 'string' || !CHART_TYPES.has(type as ChartCardModel['type'])) return null
  if (typeof labelColumn !== 'string' || !Array.isArray(valueColumns) || !valueColumns.every(value => typeof value === 'string')) return null
  if (!Array.isArray(rows)) return null
  const objects = rows.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null && !Array.isArray(row))
  if (objects.length !== rows.length) return null
  return {
    type: type as ChartCardModel['type'],
    ...(typeof meta.title === 'string' ? { title: meta.title } : {}),
    labelColumn,
    valueColumns: valueColumns as string[],
    rows: objects,
  }
}

/** Return finite chart values while preserving null gaps. */
export function chartNumbers(model: ChartCardModel, column: string): readonly (number | null)[] {
  return model.rows.map(row => typeof row[column] === 'number' && Number.isFinite(row[column]) ? row[column] as number : null)
}
