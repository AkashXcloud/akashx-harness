/** Explicit exceptions and Host packages for the published dependency policy. */

/** Packages treated as Client/Host packages without declaring `akx.client`. */
const CLIENT_FACE_INCLUDE: readonly string[] = []

/** Packages exempted from automatic Client/Host treatment despite declaring `akx.client`. */
const CLIENT_FACE_EXCLUDE: readonly string[] = [
  '@akashx/akx-api-session-controller',
  '@akashx/akx-api-workspace-controller',
]

/** Host-only packages whose peer relays are deliberately flattened. */
const HOST_DEPENDENCY_PACKAGES: readonly string[] = [
  '@akashx/akx-llm',
  '@akashx/akx-session',
]

/** Development-only package relationships not represented by source imports. */
const CONFIGURATION_ONLY_DEV_DEPENDENCIES = {
  '@akashx/akx-client-locale': ['@akashx/akx-api-remotes'],
  '@akashx/akx-client-ui-conversation': [
    '@akashx/akx-api-remotes',
    '@akashx/akx-client-ui-workspace',
  ],
  '@akashx/akx-client-ui-model-selection': ['@akashx/akx-client-ui-input-trigger'],
  '@akashx/akx-client-ui-sidebar': ['@akashx/akx-client-ui-workspace'],
  '@akashx/akx-client-ui-subagent': ['@akashx/akx-client-ui-input-trigger'],
  '@akashx/akx-client-ui-theme': ['@akashx/akx-api-remotes'],
  '@akashx/akx-client-ui-tool': ['@akashx/akx-api-remotes'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/** Workspace packages whose complete runtime surface is safe across duplicate installations. */
const DUPLICATE_SAFE_PACKAGES: readonly string[] = [
  '@akashx/akx-brand',
  '@akashx/akx-typert-protocol',
  '@akashx/akx-util-crypto',
  '@akashx/akx-util-values',
]

/**
 * Runtime exports whose values remain valid when npm installs another package copy.
 * New entries are forbidden by default. Automated agents must not add an
 * exception; every addition requires explicit human review and a dedicated,
 * prominent heading in the pull request description.
 */
const SAFE_HOST_DEPENDENCY_EXPORTS = {
  '@akashx/akx-credentials': ['credentialKey'],
  '@akashx/akx-deque': ['Deque'],
  '@akashx/akx-llm': ['callConfigEquals'],
  '@akashx/akx-session-format': ['sessionFormatLogFilename'],
  '@akashx/akx-timeout': ['MAX_TIMER_DELAY_MS'],
  '@akashx/schemastery': ['default'],
} as const satisfies HostDependencyExports

/** Runtime exports that require every consumer to resolve the provider's shared peer instance. */
const PEER_REQUIRED_HOST_EXPORTS = {
  '@akashx/akx-scope': ['carrierKeyOf', 'scopeOf', 'scopeTarget'],
  '@akashx/akx-session': ['SESSION_FORMAT_VERSION'],
  '@akashx/akx-session-persistence': ['SessionPersistenceNotFoundError'],
} as const satisfies HostDependencyExports

/** Exact import specifier to reviewed runtime exports. */
type HostDependencyExports = Readonly<Record<string, readonly string[]>>

/** Complete configurable input to package dependency classification. */
export interface PackageDependencyPolicy {
  readonly clientFaceInclude: readonly string[]
  readonly clientFaceExclude: readonly string[]
  readonly hostPackages: readonly string[]
  readonly configurationOnlyDevDependencies: Readonly<Record<string, readonly string[]>>
  readonly duplicateSafePackages?: readonly string[]
  readonly safeHostDependencyExports: HostDependencyExports
  readonly peerRequiredHostExports: HostDependencyExports
}

/** Repository dependency policy consumed by verification and benchmarking. */
export const PACKAGE_DEPENDENCY_POLICY: PackageDependencyPolicy = {
  clientFaceInclude: CLIENT_FACE_INCLUDE,
  clientFaceExclude: CLIENT_FACE_EXCLUDE,
  hostPackages: HOST_DEPENDENCY_PACKAGES,
  configurationOnlyDevDependencies: CONFIGURATION_ONLY_DEV_DEPENDENCIES,
  duplicateSafePackages: DUPLICATE_SAFE_PACKAGES,
  safeHostDependencyExports: SAFE_HOST_DEPENDENCY_EXPORTS,
  peerRequiredHostExports: PEER_REQUIRED_HOST_EXPORTS,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a package manifest declares a dynamically loaded Client entry. */
export function hasClientDeclaration(akxField: unknown): boolean {
  return isRecord(akxField) && Object.hasOwn(akxField, 'client')
}

/** Whether the repository policy flattens one package's non-Cordis peers. */
export function usesFlattenedPackageDependencies(
  manifestPath: string,
  packageName: string,
  akxField: unknown,
  policy: PackageDependencyPolicy = PACKAGE_DEPENDENCY_POLICY,
): boolean {
  if (!manifestPath.startsWith('packages/') || manifestPath.startsWith('packages/experimental/')) return false
  if (policy.hostPackages.includes(packageName)) return true
  if (manifestPath.startsWith('packages/client/')) return true
  const included = hasClientDeclaration(akxField) || policy.clientFaceInclude.includes(packageName)
  return included && !policy.clientFaceExclude.includes(packageName)
}
