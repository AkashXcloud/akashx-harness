/**
 * Resolve the public SDK launch configuration to one akx subprocess.
 * @module @akashx/akx-sdk-client/launch
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HarnessClientOptions } from './types.ts'

/** Default bound for a profile to answer the SDK initialize handshake. */
export const DEFAULT_INITIALIZE_TIMEOUT_MS = 10_000

/** Internal generic process launch used by the transport and fake-runtime tests. */
export interface RuntimeProcessOptions {
  command: string
  args: string[]
  cwd?: string
  /** Materialize the complete child environment when the client starts its subprocess. */
  environment: () => NodeJS.ProcessEnv
  description: string
  initializeTimeoutMs: number
  requestTimeoutMs?: number
  shutdownTimeoutMs?: number
  disposeEofGraceMs?: number
  disposeGraceMs?: number
}

/** Node argv plus internal profile patches required by one resolved akx entry. */
export interface AkxNodeLaunch {
  /** Arguments before the profile selector. */
  nodeArgs: string[]
  /** Internal patches applied below caller-supplied patches. */
  patches: string[]
  /** Environment values required by the resolved entry mode. */
  environment: NodeJS.ProcessEnv
}

interface PackageManifest {
  version?: unknown
  bin?: unknown
}

/** Read a package manifest from one resolved package.json URL. */
function manifest(url: string): PackageManifest {
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as PackageManifest
}

/**
 * Resolve and version-check a akx executable from package manifests.
 * @param akxManifestUrl - resolved URL of the akx package manifest.
 * @param clientManifestUrl - resolved URL of the SDK client manifest.
 * @returns the absolute akx executable path.
 */
export function resolveAkxBinFromManifests(akxManifestUrl: string, clientManifestUrl: string): string {
  const akxManifest = manifest(akxManifestUrl)
  const clientManifest = manifest(clientManifestUrl)
  if (typeof akxManifest.version !== 'string' || akxManifest.version !== clientManifest.version) {
    throw new Error(`akx SDK client ${String(clientManifest.version)} requires the same akx version, got ${String(akxManifest.version)}`)
  }
  const bin = typeof akxManifest.bin === 'object' && akxManifest.bin !== null
    ? (akxManifest.bin as Record<string, unknown>).akx
    : akxManifest.bin
  if (typeof bin !== 'string' || bin === '') throw new Error('@akashx/akx declares no akx executable')
  return resolve(dirname(fileURLToPath(akxManifestUrl)), bin)
}

/**
 * Resolve and version-check the built akx executable installed with this SDK.
 * @returns the absolute built executable path, whether or not it exists in a source checkout.
 */
export function installedAkxBin(): string {
  return resolveAkxBinFromManifests(
    import.meta.resolve('@akashx/akx/package.json'),
    new URL('../package.json', import.meta.url).href,
  )
}

/**
 * Resolve the Node launch for one same-version akx package.
 * @param akxManifestUrl - resolved URL of the akx package manifest.
 * @param clientManifestUrl - resolved URL of the SDK client manifest.
 * @param sourceLoaderUrl - optional absolute tsx loader URL for deterministic tests.
 * @returns built output, or the source entry plus its compatibility patch and tsx environment.
 */
export function resolveAkxNodeLaunchFromManifests(
  akxManifestUrl: string,
  clientManifestUrl: string,
  sourceLoaderUrl?: string,
): AkxNodeLaunch {
  const bin = resolveAkxBinFromManifests(akxManifestUrl, clientManifestUrl)
  if (existsSync(bin)) return { nodeArgs: [bin], patches: [], environment: {} }

  const packageDir = dirname(fileURLToPath(akxManifestUrl))
  const sourceBin = resolve(packageDir, 'src/bin.ts')
  const sourcePatch = resolve(packageDir, 'src/sdk-source.cordis.patch.yml')
  const sourceTsconfig = resolve(packageDir, 'tsconfig.json')
  if (!existsSync(sourceBin) || !existsSync(sourcePatch) || !existsSync(sourceTsconfig)) {
    throw new Error(
      `@akashx/akx is missing its built executable ${bin} and complete source launch files ${sourceBin}, ${sourcePatch}, ${sourceTsconfig}`,
    )
  }
  const loader = sourceLoaderUrl ?? import.meta.resolve('tsx/esm')
  return {
    nodeArgs: ['--import', loader, sourceBin],
    patches: [sourcePatch],
    environment: { TSX_TSCONFIG_PATH: sourceTsconfig },
  }
}

/**
 * Resolve the installed akx package to a built or source Node launch.
 * @returns the launch descriptor for the current checkout or installed package.
 */
function installedAkxNodeLaunch(): AkxNodeLaunch {
  return resolveAkxNodeLaunchFromManifests(
    import.meta.resolve('@akashx/akx/package.json'),
    new URL('../package.json', import.meta.url).href,
  )
}

/**
 * Resolve caller-relative filesystem inputs and construct canonical akx argv.
 * @param options - public SDK launch options.
 * @param callerCwd - parent-process directory used for lexical resolution.
 * @returns one generic subprocess spec for the JSON-RPC transport.
 */
export function resolveAkxLaunch(
  options: HarnessClientOptions = {},
  callerCwd: string = process.cwd(),
): RuntimeProcessOptions {
  const profile = options.profile ?? 'sdk'
  const akxLaunch = options.akxBin === undefined
    ? installedAkxNodeLaunch()
    : { nodeArgs: [resolve(callerCwd, options.akxBin)], patches: [], environment: {} }
  const patches = [
    ...akxLaunch.patches,
    ...(options.patches ?? []).map(path => resolve(callerCwd, path)),
  ]
  const akxHome = options.akxHome === undefined ? undefined : resolve(callerCwd, options.akxHome)
  return {
    command: process.execPath,
    args: [...akxLaunch.nodeArgs, '--profile', profile, ...patches.flatMap(path => ['--patch', path])],
    ...options.processCwd === undefined ? {} : { cwd: resolve(callerCwd, options.processCwd) },
    environment: () => ({
      ...(options.env ?? process.env),
      ...akxLaunch.environment,
      ...akxHome === undefined ? {} : { AKX_HOME: akxHome },
    }),
    description: `akx profile ${JSON.stringify(profile)}`,
    initializeTimeoutMs: options.initializeTimeoutMs ?? DEFAULT_INITIALIZE_TIMEOUT_MS,
    ...options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs },
    ...options.shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs: options.shutdownTimeoutMs },
    ...options.disposeEofGraceMs === undefined ? {} : { disposeEofGraceMs: options.disposeEofGraceMs },
    ...options.disposeGraceMs === undefined ? {} : { disposeGraceMs: options.disposeGraceMs },
  }
}
