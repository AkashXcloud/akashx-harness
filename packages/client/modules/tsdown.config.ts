import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@akashx/akx-client-modules',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
