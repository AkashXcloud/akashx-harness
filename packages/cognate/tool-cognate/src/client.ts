/**
 * Client-namespace projection of the Cognate tool's usage vocabulary: a pure re-export
 * of the package's types outlet. Client code imports ONLY the client namespace (repo
 * discipline), so `./client` projects the same single-source content `./types` serves
 * to host consumers.
 *
 * @module @akashx/akx-tool-cognate/client
 */

export type * from './types.ts'
