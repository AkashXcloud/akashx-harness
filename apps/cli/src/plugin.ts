/**
 * `akx plugin --profile <name> <args...>` — profile plugin management as a
 * thin pnpm forwarder: initialize the profile on first use, run
 * `pnpm <args...>` in the profile directory, then reconcile the
 * `akx.profile.bundles` layer list against the installed state (a dependency
 * resolving to a package that declares `akx.bundle` joins the layer stack; a
 * removed or bundle-less dependency leaves it). Reconciling by installed
 * state, not by dependency diff, means `update` activates a package that
 * gained its `akx.bundle` declaration in a newer version.
 * @module @akashx/akx/plugin
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  DEFAULT_PROFILE_BUNDLES,
  initProfile,
  PROFILE_TEMPLATES,
  readProfileManifest,
  resolveBundleDir,
  resolveProfileDir,
  writeProfileManifest,
  type ProfileManifest,
} from '@akashx/akx-app-boot'
import { INSTALL_ANCHOR } from './profile-boot.ts'

const NAME = 'akx'

/**
 * Whether a resolved dependency exports a profile patch, i.e. is a bundle.
 * @param packageName - the dependency's package name.
 * @param profileDir - the profile directory (resolution anchor).
 * @returns true when the package manifest declares `akx.bundle`.
 */
function exportsPatch(packageName: string, profileDir: string, binName: string): boolean {
  let dir: string
  try {
    dir = resolveBundleDir(binName, packageName, INSTALL_ANCHOR, profileDir)
  } catch {
    return false // pnpm reported success yet the package is unresolvable — treat as plain
  }
  const manifest = readProfileManifest(binName, dir)
  return manifest.akx?.bundle?.patch !== undefined
}

/**
 * Reconcile `akx.profile.bundles` against the installed state: pnpm has
 * already written the real installed names (so a git/path/tarball/alias spec
 * on the command line reconciles by its true package name) and materialized
 * the packages. A dependency that resolves to a `akx.bundle`-declaring
 * package joins the layer stack (appended in dependency order); a
 * dependency-listed name that no longer does — removed, or the installed
 * version dropped the declaration — leaves it. In-box bundles from the
 * profile template are not dependencies and are never touched. Warns once
 * per newly-added bundle-less dependency (a plain library is fine; the
 * warning is orientation).
 */
function reconcilePlugins(before: ProfileManifest, profileDir: string, binName: string): void {
  const after = readProfileManifest(binName, profileDir)
  const beforeDeps = new Set(Object.keys(before.dependencies ?? {}))
  const dependencies = Object.keys(after.dependencies ?? {})
  const plugins = after.akx?.profile?.bundles ?? []
  let changed = false
  for (const packageName of dependencies) {
    const isBundle = exportsPatch(packageName, profileDir, binName)
    if (isBundle && !plugins.includes(packageName)) {
      plugins.push(packageName)
      changed = true
    } else if (!isBundle && !beforeDeps.has(packageName)) {
      process.stderr.write(
        `${binName}: warning: ${packageName} declares no akx.bundle — installed as a plain dependency, not a profile layer `
        + '(a later update that gains one activates it automatically)\n',
      )
    }
  }
  const dependencySet = new Set(dependencies)
  for (const packageName of [...plugins]) {
    // Only dependency-managed entries are subject to removal; template
    // bundles (akx-base and friends) are not dependencies.
    const wasDependency = beforeDeps.has(packageName) || dependencySet.has(packageName)
    const stillBundle = dependencySet.has(packageName) && exportsPatch(packageName, profileDir, binName)
    if (wasDependency && !stillBundle) {
      plugins.splice(plugins.indexOf(packageName), 1)
      changed = true
    }
  }
  if (!changed) return
  after.akx = { ...after.akx, profile: { ...after.akx?.profile, bundles: plugins } }
  writeProfileManifest(profileDir, after)
}

/**
 * Rewrite relative filesystem specs against the user's invoking directory.
 * pnpm runs with cwd = the profile directory, so a bare `.` or `../plugin`
 * (or their `file:`/`link:` forms) would silently resolve inside the profile
 * — `add .` from a plugin checkout would self-link the profile. Absolute
 * specs, registry names, and every other pnpm argument pass through
 * untouched.
 * @param argument - one pnpm argument, verbatim from argv.
 * @param cwd - the directory `akx` was invoked from.
 * @returns the argument with a relative path spec anchored to `cwd`.
 */
function anchorPathSpec(argument: string, cwd: string): string {
  const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/.exec(argument)
  if (match?.groups?.path === undefined) return argument
  // A bare path stays bare and a prefixed spec keeps its prefix: pnpm's
  // link-vs-copy semantics differ between `file:` and a plain directory
  // path, and the anchor must not change which one the user asked for.
  const prefix = match.groups.prefix ?? ''
  return `${prefix}${resolve(cwd, match.groups.path)}`
}

/**
 * Run one `akx plugin` invocation: init if needed, forward to pnpm, reconcile.
 * @param profile - the profile name.
 * @param args - pnpm arguments with relative path specs anchored to the invoking directory.
 * @param binName - executable name used in diagnostics.
 * @returns the pnpm exit code.
 */
export function runPlugin(profile: string, args: readonly string[], binName = NAME): number {
  const dir = resolveProfileDir(profile)
  if (!existsSync(join(dir, 'package.json'))) {
    const template = PROFILE_TEMPLATES[profile]
    initProfile(
      dir,
      template?.bundles ?? DEFAULT_PROFILE_BUNDLES,
      template?.patchReload,
    )
    process.stderr.write(`${binName}: initialized profile ${profile} at ${dir}\n`)
  }
  const before = readProfileManifest(binName, dir)
  // Windows resolves pnpm through its .cmd shim, which spawn() refuses
  // without a shell since the CVE-2024-27980 hardening.
  const result = spawnSync('pnpm', args.map(argument => anchorPathSpec(argument, process.cwd())), {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error !== undefined) {
    const code = (result.error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      process.stderr.write(`${binName}: pnpm not found on PATH — install pnpm to manage profile plugins\n`)
      return 127
    }
    throw result.error
  }
  const exitCode = result.status ?? 1
  if (exitCode === 0) {
    reconcilePlugins(before, dir, binName)
  } else {
    // pnpm's own diagnostics name pnpm-workspace.yaml without saying WHICH
    // one; the profile owns it, and the commonest failure here is pnpm ≥10
    // blocking a git dependency's prepare (build) script until allowlisted.
    process.stderr.write(`${binName}: pnpm failed in profile directory ${dir}\n`)
    if (args.some(argument => /^git\+|^github:|\.git(?:#|$)/.test(argument))) {
      process.stderr.write(
        `${binName}: git-hosted plugins build on install via their prepare script, which pnpm blocks until allowed — `
        + `add the exact key pnpm printed above under allowBuilds in ${join(dir, 'pnpm-workspace.yaml')}, then re-run\n`,
      )
    }
  }
  return exitCode
}
