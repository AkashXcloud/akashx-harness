/**
 * Cost copy. Product text is locale-owned, so every string the pill renders
 * resolves through this dictionary rather than appearing in a component.
 *
 * @module @akashx/akx-client-ui-cost/locales
 */

/** The cost dictionary, and the source of its key union. */
export const en = {
  'pill.agent': 'Agent model: {amount}',
  'pill.database': 'Database models: {amount}',
  'pill.unpriced': 'No rate configured for: {models}',
} as const

/** Key union for the cost dictionary. */
export type CostKey = keyof typeof en
