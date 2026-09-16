import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@akashx/akx-session-log-export',
  ['lib/types/index.js'],
  { hostPhase: true },
)
