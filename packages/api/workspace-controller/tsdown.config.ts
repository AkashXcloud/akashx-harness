import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@akashx/akx-api-workspace-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
