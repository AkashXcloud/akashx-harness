/**
 * AkashX Bridge, node half: the durable benchmark answer key.
 *
 * A benchmark's answers are a deployment fact — which suite is loaded differs
 * by machine, and the suite changes without any code moving — so the key is a
 * user-settings section rather than anything compiled in. The browser half
 * reads the same section and matches questions against it; nothing here grades
 * anything. The panel itself ships through exports["./client"], discovered from
 * the package.json akx.client declaration.
 *
 * @module @akashx/akx-client-ui-bridge
 */

import type { Context } from '@akashx/cordis'
import type {} from '@akashx/akx-settings'
import { BRIDGE_SETTINGS_NAMESPACE, BridgeSettingsSchema } from './bridge-settings.ts'

export {
  BRIDGE_SETTINGS_NAMESPACE, BridgeSettingsSchema,
  type BenchAnswer, type BridgeSettings,
} from './bridge-settings.ts'

/**
 * Register the durable answer key when the optional settings service is composed.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(BRIDGE_SETTINGS_NAMESPACE, BridgeSettingsSchema)
  })
}
