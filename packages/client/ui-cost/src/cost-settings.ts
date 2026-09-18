/** The rate card stored in the Host user-settings document. */

import z from '@akashx/schemastery'

/** Settings namespace owned by the cost plugin. */
export const COST_SETTINGS_NAMESPACE = 'ui-cost'

/** What one model costs, in US dollars per million tokens. */
export interface ModelRateSetting {
  /** Input tokens the provider billed in full. */
  input: number
  /** Output tokens. */
  output: number
  /** Input served from the provider's cache; defaults to `input`. */
  cachedInput?: number
  /** Input written into the provider's cache; defaults to `input`. */
  cacheWrite?: number
}

/** Durable cost section shared by the Host schema and the browser scope. */
export interface CostSettings {
  /**
   * Rates by `provider/model`, or by bare `model` as a fallback. A model absent
   * from the card is reported unpriced rather than free.
   */
  rates: Record<string, ModelRateSetting>
}

/** Durable cost schema; also the wire envelope the browser scope validates against. */
export const CostSettingsSchema = z.object({
  rates: z.dict(z.object({
    input: z.number().min(0),
    output: z.number().min(0),
    cachedInput: z.number().min(0),
    cacheWrite: z.number().min(0),
  })).default({}),
}) as unknown as z<CostSettings>
