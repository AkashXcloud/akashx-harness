/**
 * Session cost, node half: the durable rate card.
 *
 * A model's price is a deployment fact — it differs by contract, by region and
 * by date — so the card is a user-settings section rather than anything
 * compiled in. The browser half reads the same section and does the
 * arithmetic; nothing here prices anything.
 *
 * @module @akashx/akx-client-ui-cost
 */

import type { Context } from '@akashx/cordis'
import type {} from '@akashx/akx-settings'
import { COST_SETTINGS_NAMESPACE, CostSettingsSchema } from './cost-settings.ts'

export {
  COST_SETTINGS_NAMESPACE, CostSettingsSchema,
  type CostSettings, type ModelRateSetting,
} from './cost-settings.ts'

/**
 * Register the durable rate card when the optional settings service is composed.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(COST_SETTINGS_NAMESPACE, CostSettingsSchema)
  })
}
