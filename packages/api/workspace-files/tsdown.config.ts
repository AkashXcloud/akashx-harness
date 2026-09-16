import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@akashx/akx-api-workspace-files',
  ['lib/types/index.js'],
  { hostPhase: true },
)
