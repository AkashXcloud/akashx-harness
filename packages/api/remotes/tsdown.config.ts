import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@akashx/akx-api-remotes',
  ['lib/types/index.js'],
  { hostPhase: true },
)
