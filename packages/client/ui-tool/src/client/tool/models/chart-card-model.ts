/** Pure projection of Cognate chart presentation metadata into a safe SVG model. */
import type { ToolCallBlock } from '@akashx/akx-client-ui-chat/client'

/** Chart type and the tabular data the persisted `render_chart` result carries. */
export interface ChartCardModel {
  /** Chart form the Tool call requested. */
  type: 'bar' | 'line' | 'area' | 'pie' | 'scatter'
  /** Optional chart title. */
  title?: string
  /** Row key holding each data point's category label. */
  labelColumn: string
  /** Row keys holding one series each. */
  valueColumns: readonly string[]
  /** Bounded rows as supplied by the model. */
  rows: readonly Record<string, unknown>[]
}

const CHART_TYPES = new Set<ChartCardModel['type']>(['bar', 'line', 'area', 'pie', 'scatter'])

/**
 * Read chart metadata persisted on a settled `render_chart` result.
 * @param toolName - the Tool call's name; any other tool yields null.
 * @param block - the settled Tool call block carrying persisted metadata.
 * @returns the validated chart model, or null when absent or malformed.
 */
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
    valueColumns,
    rows: objects,
  }
}

/**
 * Return finite chart values while preserving null gaps.
 * @param model - the chart model whose rows are read.
 * @param column - the row key holding one series.
 * @returns one value per row, null for a missing or non-finite entry.
 */
export function chartNumbers(model: ChartCardModel, column: string): readonly (number | null)[] {
  return model.rows.map((row) => {
    const value = row[column]
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  })
}
