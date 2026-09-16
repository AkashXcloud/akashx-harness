/** Release family discovery, publish order, tag naming, and the bump judgements. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { officialClientBuildEnvironment, writeClientBuildRecord } from '../client-build-environment.ts'
import { releaseFamily, type ReleaseMember } from './families.ts'
import { compareVersions, nextVendorVersion, planShared, reachesPayload } from './bump.ts'

/**
 * A release member standing in for a manifest on disk.
 * @param directory - repository-relative package directory.
 * @param name - package name.
 * @param manifest - manifest fields the subject reads.
 * @returns The member.
 */
function member(directory: string, name: string, manifest: Record<string, unknown> = {}): ReleaseMember {
  return { directory, name, version: '0.0.1', manifest }
}

const roots: string[] = []

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function buildFixture(environment: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'akx-release-build-'))
  roots.push(root)
  write(join(root, 'package.json'), `${JSON.stringify({ version: environment.AKX_CLIENT_VERSION ?? '0.0.1' })}\n`)
  write(join(root, 'apps/web/dist/index.html'), '<main></main>')
  write(join(root, 'packages/client/example/lib/client.js'), 'module.exports = {}\n')
  writeClientBuildRecord(root, environment)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('release families', () => {
  it('publishes Agent Teams while excluding private experimental packages', () => {
    const members = releaseFamily('akx').members(resolve(import.meta.dirname, '../..'))

    expect(members
      .filter(member => member.directory.startsWith('packages/experimental/'))
      .map(member => member.name)).toEqual([
      '@akashx/akx-experimental-agent-team-profile',
      '@akashx/akx-experimental-agent-team-web-profile',
      '@akashx/akx-experimental-agent-team',
      '@akashx/akx-experimental-client-ui-agent-team',
      '@akashx/akx-experimental-tool-agent-team',
    ])
    expect(members.map(member => member.name)).not.toContain('@akashx/akx-experimental-inspector')
  })

  it('excludes private applications from the publish set', () => {
    const root = mkdtempSync(join(tmpdir(), 'akx-release-private-'))
    roots.push(root)
    write(join(root, 'apps/public/package.json'), '{"name":"@akashx/akx-public","version":"0.0.1"}\n')
    write(join(root, 'apps/private/package.json'), '{"name":"@akashx/akx-private","version":"0.0.1","private":true}\n')

    expect(releaseFamily('akx').members(root).map(entry => entry.name)).toEqual(['@akashx/akx-public'])
  })

  it('bumps private akx workspaces without adding release tags', () => {
    const root = mkdtempSync(join(tmpdir(), 'akx-release-version-'))
    roots.push(root)
    write(join(root, 'package.json'), '{"version":"0.0.1"}\n')
    write(join(root, 'apps/desktop/package.json'), '{"version":"0.0.1","private":true}\n')
    write(join(root, 'packages/experimental/prototype/package.json'), '{"version":"0.0.1","private":true}\n')
    write(join(root, 'packages/core/unselected/package.json'), '{"version":"0.0.1"}\n')

    const akx = releaseFamily('akx')
    const published = member('packages/core/published', '@akashx/akx-published')
    const { planned } = planShared(akx, root, [published], '0.0.2')

    expect(planned.map(entry => ({ path: entry.manifestPath, tag: entry.tag }))).toEqual([
      { path: 'package.json', tag: undefined },
      { path: 'packages/core/published/package.json', tag: 'akx-v0.0.2' },
      { path: 'apps/desktop/package.json', tag: undefined },
      { path: 'packages/experimental/prototype/package.json', tag: undefined },
    ])
  })

  it.each(['0.0.2-alpha.1', '0.0.2-canary.1', '0.0.2-rc.1'])(
    'accepts the explicit akx prerelease version %s',
    (version) => {
      const root = mkdtempSync(join(tmpdir(), 'akx-release-prerelease-'))
      roots.push(root)
      write(join(root, 'package.json'), '{"version":"0.0.1"}\n')

      const akx = releaseFamily('akx')
      const published = member('packages/core/published', '@akashx/akx-published')
      const plan = planShared(akx, root, [published], version)

      expect(plan.version).toBe(version)
      expect(plan.planned[1]?.tag).toBe(`akx-v${version}`)
    },
  )

  it('names one tag for the whole akx family and one per vendored package', () => {
    const akx = releaseFamily('akx')
    const vendor = releaseFamily('vendor')
    const cli = member('apps/cli', '@akashx/akx')
    const cordis = { ...member('vendor/cordis', '@akashx/cordis'), version: '4.0.1' }

    expect(akx.tagFor(cli)).toBe('akx-v0.0.1')
    expect(vendor.tagFor(cordis)).toBe('vendor-cordis-v4.0.1')
    // The prefix is constructed, not recovered from a tag: a version with a
    // hyphen would defeat any suffix-stripping.
    expect(vendor.tagPrefixFor({ ...cordis, version: '4.0.0-rc.7' })).toBe('vendor-cordis-v')
    expect(vendor.tagFor({ ...cordis, version: '4.0.0-rc.7' })).toBe('vendor-cordis-v4.0.0-rc.7')
  })

  it('assigns alpha and canary dist-tags only to akx releases', () => {
    const akx = releaseFamily('akx')
    const vendor = releaseFamily('vendor')

    expect(akx.distTagForVersion('0.0.2-alpha.1')).toBe('alpha')
    expect(akx.distTagForVersion('0.0.2-canary.1')).toBe('canary')
    expect(akx.distTagForVersion('0.0.2-rc.1')).toBe('next')
    expect(akx.distTagForVersion('0.0.2')).toBeUndefined()
    expect(vendor.distTagForVersion('4.0.1-alpha.1')).toBe('next')
    expect(vendor.distTagForVersion('4.0.1-canary.1')).toBe('next')
  })

  it('rejects a family whose members disagree on the shared version', () => {
    const akx = releaseFamily('akx')
    const members = [member('apps/cli', '@akashx/akx'), { ...member('apps/web', '@akashx/akx-web-frontend'), version: '0.0.2' }]

    expect(() => { akx.verifyVersions(members) }).toThrow(/must share one version/)
    expect(() => { akx.verifyVersions([members[0]!]) }).not.toThrow()
  })

  it('accepts independent vendored versions and rejects an unpublishable one', () => {
    const vendor = releaseFamily('vendor')
    const members = [
      { ...member('vendor/cordis', '@akashx/cordis'), version: '4.0.1' },
      { ...member('vendor/cosmokit', '@akashx/cosmokit'), version: '1.8.2' },
    ]

    expect(() => { vendor.verifyVersions(members) }).not.toThrow()
    expect(() => { vendor.verifyVersions([{ ...members[0]!, version: 'latest' }]) }).toThrow(/unpublishable version/)
  })

  it('requires a current official client build only for akx artifacts', () => {
    const akx = releaseFamily('akx')
    const vendor = releaseFamily('vendor')
    const officialEnvironment = officialClientBuildEnvironment(resolve(import.meta.dirname, '../..'))
    vi.stubEnv('AKX_CLIENT_COMMIT_HASH', officialEnvironment.AKX_CLIENT_COMMIT_HASH)
    const official = buildFixture(officialEnvironment)
    const defaultBuild = buildFixture({})
    const missing = join(defaultBuild, 'missing')
    write(join(missing, 'package.json'), `${JSON.stringify({ version: officialEnvironment.AKX_CLIENT_VERSION })}\n`)

    expect(() => { akx.verifyBuildArtifacts(official) }).not.toThrow()
    expect(() => { akx.verifyBuildArtifacts(defaultBuild) }).toThrow(/AKX_CLIENT_TITLE/)
    expect(() => { akx.verifyBuildArtifacts(missing) }).toThrow(/record.*missing/)
    expect(() => { vendor.verifyBuildArtifacts(missing) }).not.toThrow()

    write(join(official, 'packages/client/example/lib/client.js'), 'module.exports = { changed: true }\n')
    expect(() => { akx.verifyBuildArtifacts(official) }).toThrow(/artifacts differ/)
  })

  it('publishes a dependency before its consumer, and orders ties by name', () => {
    const akx = releaseFamily('akx')
    const members = [
      member('packages/a/consumer', '@akashx/akx-consumer', { dependencies: { '@akashx/akx-library': 'workspace:^' } }),
      member('packages/a/library', '@akashx/akx-library'),
      member('packages/a/zebra', '@akashx/akx-zebra'),
    ]

    expect(akx.publishOrder(members).order.map(entry => entry.name)).toEqual([
      '@akashx/akx-library',
      '@akashx/akx-consumer',
      '@akashx/akx-zebra',
    ])
  })

  it('reports a runtime dependency cycle instead of emitting an arbitrary order', () => {
    const akx = releaseFamily('akx')
    const members = [
      member('packages/a/left', '@akashx/akx-left', { dependencies: { '@akashx/akx-right': 'workspace:^' } }),
      member('packages/a/right', '@akashx/akx-right', { dependencies: { '@akashx/akx-left': 'workspace:^' } }),
    ]

    expect(() => { akx.publishOrder(members) }).toThrow(/dependency cycle/)
  })

  it('publishes a peer before its consumer', () => {
    const akx = releaseFamily('akx')
    const members = [
      member('packages/a/consumer', '@akashx/akx-consumer', { peerDependencies: { '@akashx/akx-zebra': 'workspace:^' } }),
      member('packages/a/zebra', '@akashx/akx-zebra'),
    ]

    // Name order alone would place the consumer first; the peer edge moves it.
    expect(akx.publishOrder(members).order.map(entry => entry.name)).toEqual([
      '@akashx/akx-zebra',
      '@akashx/akx-consumer',
    ])
  })

  it('orders around a peer cycle rather than refusing to publish, and reports the edge it dropped', () => {
    const akx = releaseFamily('akx')
    const members = [
      member('packages/a/left', '@akashx/akx-left', { peerDependencies: { '@akashx/akx-right': 'workspace:^' } }),
      member('packages/a/right', '@akashx/akx-right', { peerDependencies: { '@akashx/akx-left': 'workspace:^' } }),
    ]

    // Sibling packages declare each other as peers, and npm treats an unmet peer
    // as a warning, so this pair has to publish rather than fail the release.
    const plan = akx.publishOrder(members)
    expect(plan.order.map(entry => entry.name)).toEqual([
      '@akashx/akx-right',
      '@akashx/akx-left',
    ])
    // One of the two edges has to give, and which one it is belongs in the log.
    expect(plan.droppedPeerEdges).toEqual([
      { consumer: '@akashx/akx-right', peer: '@akashx/akx-left' },
    ])
  })

  it('honours an install edge even when a peer cycle surrounds it', () => {
    const akx = releaseFamily('akx')
    const members = [
      member('packages/a/base', '@akashx/akx-base', { peerDependencies: { '@akashx/akx-consumer': 'workspace:^' } }),
      member('packages/a/consumer', '@akashx/akx-consumer', {
        dependencies: { '@akashx/akx-base': 'workspace:^' },
        peerDependencies: { '@akashx/akx-base': 'workspace:^' },
      }),
    ]

    // The install edge is absolute: base publishes first, and the peer edge that
    // would reverse it is the one dropped.
    const plan = akx.publishOrder(members)
    expect(plan.order.map(entry => entry.name)).toEqual([
      '@akashx/akx-base',
      '@akashx/akx-consumer',
    ])
    expect(plan.droppedPeerEdges).toEqual([
      { consumer: '@akashx/akx-base', peer: '@akashx/akx-consumer' },
    ])
  })

  it('refuses an order that would publish a consumer before a dependency it installs', () => {
    const akx = releaseFamily('akx')
    const members = [
      member('packages/a/alpha', '@akashx/akx-alpha', { peerDependencies: { '@akashx/akx-bravo': 'workspace:^' } }),
      member('packages/a/bravo', '@akashx/akx-bravo', { peerDependencies: { '@akashx/akx-charlie': 'workspace:^' } }),
      member('packages/a/charlie', '@akashx/akx-charlie', { dependencies: { '@akashx/akx-alpha': 'workspace:^' } }),
    ]

    // A cycle of two peer edges closed by one install edge: dropping a peer edge
    // would order this, and the traversal drops the install edge instead. That
    // order would publish charlie before the alpha it installs, so it is refused
    // here rather than published.
    expect(() => { akx.publishOrder(members) }).toThrow(/no publish order honours @akashx\/akx-charlie -> @akashx\/akx-alpha/)
  })

  it('ignores devDependencies when ordering', () => {
    const akx = releaseFamily('akx')
    const members = [
      member('packages/a/alpha', '@akashx/akx-alpha', { devDependencies: { '@akashx/akx-zebra': 'workspace:^' } }),
      member('packages/a/zebra', '@akashx/akx-zebra'),
    ]

    // A dev dependency is absent from the published package, so it must not move
    // the consumer behind it.
    expect(akx.publishOrder(members).order.map(entry => entry.name)).toEqual([
      '@akashx/akx-alpha',
      '@akashx/akx-zebra',
    ])
  })

  it('applies the harness payload policy to akx and keeps upstream payloads for vendored packages', () => {
    const akx = releaseFamily('akx')
    const vendor = releaseFamily('vendor')
    const harness = member('packages/a/library', '@akashx/akx-library')
    const vendored = member('vendor/cordis', '@akashx/cordis')

    expect(() => { akx.validatePayload(harness, ['package/lib/index.js', 'package/src/index.ts']) })
      .toThrow(/publishes source file/)
    expect(() => { vendor.validatePayload(vendored, ['package/lib/index.js', 'package/src/index.ts']) }).not.toThrow()
    expect(() => { vendor.validatePayload(vendored, []) }).toThrow(/empty tarball/)
  })

  it('drives the installed entry only for the family that publishes one', () => {
    expect(releaseFamily('akx').installedEntry).toEqual({ packageName: '@akashx/akx', binPath: 'lib/bin.js' })
    expect(releaseFamily('vendor').installedEntry).toBeUndefined()
  })

  it('rejects an unknown family identifier', () => {
    expect(() => { releaseFamily('native') }).toThrow(/unknown release family/)
  })
})

describe('vendored version baseline', () => {
  it('drops an upstream prerelease segment and increments the patch', () => {
    expect(nextVendorVersion('4.0.0-rc.7', undefined)).toBe('4.0.1')
    expect(nextVendorVersion('1.0.0-rc.5', undefined)).toBe('1.0.1')
    expect(nextVendorVersion('1.8.1', undefined)).toBe('1.8.2')
  })

  it('increments from the last published version when a re-sync restored a lower one', () => {
    // Upstream moved rc.7 -> rc.8 after this repository published 4.0.1;
    // incrementing the manifest alone would name 4.0.1 a second time.
    expect(nextVendorVersion('4.0.0-rc.8', '4.0.1')).toBe('4.0.2')
    expect(nextVendorVersion('4.1.0', '4.0.1')).toBe('4.1.1')
  })

  it('appends a rehearsal prerelease without consuming its release numbers', () => {
    // A rehearsal burns 4.0.1-rc.1 and leaves 4.0.1 free, so the stable release
    // that follows takes those same numbers instead of skipping to 4.0.2.
    expect(nextVendorVersion('4.0.0-rc.7', undefined, 'rc.1')).toBe('4.0.1-rc.1')
    expect(nextVendorVersion('4.0.0-rc.7', '4.0.1-rc.1', 'rc.2')).toBe('4.0.1-rc.2')
    expect(nextVendorVersion('4.0.0-rc.7', '4.0.1-rc.1')).toBe('4.0.1')
    expect(nextVendorVersion('4.0.0-rc.7', '4.0.1')).toBe('4.0.2')
  })
})

describe('version precedence', () => {
  it('orders alpha, canary, and release-candidate versions by semver precedence', () => {
    expect(compareVersions('4.0.1-alpha.1', '4.0.1-canary.1')).toBeLessThan(0)
    expect(compareVersions('4.0.1-canary.1', '4.0.1-rc.1')).toBeLessThan(0)
    expect(compareVersions('4.0.1-rc.1', '4.0.1')).toBeLessThan(0)
  })

  it('ranks a release above the prerelease it follows', () => {
    // git --sort=v:refname disagrees, placing 4.0.1-rc.1 above 4.0.1, which is
    // why the newest published version is chosen here rather than by git.
    expect(compareVersions('4.0.1', '4.0.1-rc.1')).toBeGreaterThan(0)
    expect(compareVersions('4.0.1-rc.1', '4.0.1')).toBeLessThan(0)
  })

  it('compares numeric prerelease fields numerically', () => {
    expect(compareVersions('4.0.1-rc.10', '4.0.1-rc.1')).toBeGreaterThan(0)
    expect(compareVersions('4.0.1-rc.2', '4.0.1-rc.10')).toBeLessThan(0)
  })

  it('ranks a numeric field below an alphanumeric one, and a shorter list below a longer', () => {
    expect(compareVersions('4.0.1-1', '4.0.1-alpha')).toBeLessThan(0)
    expect(compareVersions('4.0.1-rc', '4.0.1-rc.1')).toBeLessThan(0)
    expect(compareVersions('4.0.2', '4.0.1')).toBeGreaterThan(0)
    expect(compareVersions('4.0.1-rc.1', '4.0.1-rc.1')).toBe(0)
  })
})

describe('payload change judgement', () => {
  const sourceShipping = member('vendor/cosmokit', '@akashx/cosmokit', {
    files: ['lib/index.js', 'lib/types/**/*.d.ts', 'src'],
  })
  const buildOutputOnly = member('vendor/cordis', '@akashx/cordis', {
    files: ['lib/index.js', 'lib/types/**/*.d.ts', 'bin.js'],
  })

  it('counts the manifest and the files npm always publishes', () => {
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/package.json')).toBe(true)
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/README.md')).toBe(true)
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/src/index.ts')).toBe(true)
  })

  it('counts build inputs for a package whose payload is build output', () => {
    // cordis publishes lib/ only, and lib/ is not tracked: without this, a real
    // source change reads as "nothing changed" and the next publish fails on a
    // version whose bytes moved.
    expect(reachesPayload(buildOutputOnly, 'vendor/cordis/src/context.ts')).toBe(true)
    expect(reachesPayload(buildOutputOnly, 'vendor/cordis/tsconfig.json')).toBe(true)
  })

  it('ignores paths no tarball carries', () => {
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/tests/unit.spec.ts')).toBe(false)
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/CHANGELOG.md')).toBe(false)
    // The README pattern is deliberately loose: over-reporting a change costs one
    // unnecessary patch bump, while under-reporting fails the next publish on a
    // version whose bytes moved.
    expect(reachesPayload(sourceShipping, 'vendor/cosmokit/README.i18n.yaml')).toBe(true)
    expect(reachesPayload(member('packages/a/library', '@akashx/akx-library', { files: ['lib/index.js'] }),
      'packages/a/library/tests/library.spec.ts')).toBe(false)
  })
})
