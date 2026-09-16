/** AkashX Files API identifiers. @module akx-llm-akx/file-id */

import type { Branded } from '@akashx/akx-brand'

/** Opaque identifier returned by the AkashX Files API. */
export type AkashXFileId = Branded<'AkashXFileId'>

/**
 * Brand a provider-returned file identifier after wire validation.
 * @param id - non-empty Files API identifier.
 * @returns the same string with its provider identity attached at type level.
 */
export function AkashXFileId(id: string): AkashXFileId {
  return id as AkashXFileId
}

/** Non-secret digest identifying one endpoint and API-key file namespace. */
export type AkashXFileScope = Branded<'AkashXFileScope'>

/**
 * Brand a locally derived namespace digest.
 * @param scope - SHA-256 digest of endpoint and API key.
 * @returns the same string with namespace identity attached at type level.
 */
export function AkashXFileScope(scope: string): AkashXFileScope {
  return scope as AkashXFileScope
}
