import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@akashx/akx-api-session-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
