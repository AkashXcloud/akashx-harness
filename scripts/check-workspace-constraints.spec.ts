/** Experimental-package publication and dependency constraints. */

import { describe, expect, it } from 'vitest'
import {
  checkAkxFamilyVersion,
  checkExperimentalDependencyIsolation,
  checkExperimentalManifest,
  expectedAkxPackageFiles,
  type WorkspaceManifest,
} from './check-workspace-constraints.ts'

const experimental: WorkspaceManifest = {
  dir: 'packages/experimental/prototype',
  manifest: { name: '@akashx/akx-experimental-prototype', private: true },
}

const publicExperimental: WorkspaceManifest = {
  dir: 'packages/experimental/agent-team',
  manifest: {
    name: '@akashx/akx-experimental-agent-team',
    publishConfig: { access: 'public' },
  },
}

describe('experimental workspace constraints', () => {
  it('requires the experimental package-name prefix', () => {
    expect(checkExperimentalManifest({
      ...experimental,
      manifest: { ...experimental.manifest, name: '@akashx/akx-prototype' },
    })).toEqual([
      '@akashx/akx-prototype: experimental package name must start with "@akashx/akx-experimental-"',
    ])
  })

  it('requires private manifests without publication metadata', () => {
    expect(checkExperimentalManifest(experimental)).toEqual([])
    expect(checkExperimentalManifest({
      ...experimental,
      manifest: { ...experimental.manifest, private: false, publishConfig: { access: 'public' } },
    })).toEqual([
      '@akashx/akx-experimental-prototype: experimental package must set "private": true',
      '@akashx/akx-experimental-prototype: experimental package must omit publishConfig',
    ])
  })

  it('requires public metadata only for the Agent Teams exceptions', () => {
    expect(checkExperimentalManifest(publicExperimental)).toEqual([])
    expect(checkExperimentalManifest({
      ...publicExperimental,
      manifest: {
        name: '@akashx/akx-experimental-agent-team',
        private: true,
      },
    })).toEqual([
      '@akashx/akx-experimental-agent-team: public experimental package must not set "private": true',
      '@akashx/akx-experimental-agent-team: public experimental package must set publishConfig.access to "public"',
    ])
  })

  it.each(['dependencies', 'optionalDependencies', 'peerDependencies'] as const)(
    'rejects release %s on an experimental package',
    (section) => {
      expect(checkExperimentalDependencyIsolation([experimental, {
        dir: 'packages/core/consumer',
        manifest: {
          name: '@akashx/akx-consumer',
          [section]: { '@akashx/akx-experimental-prototype': 'workspace:^' },
        },
      }])).toEqual([
        `@akashx/akx-consumer: ${section}.@akashx/akx-experimental-prototype must not reference an experimental package`,
      ])
    },
  )

  it('allows development and experimental consumers but rejects the Python release runtime', () => {
    const manifests: WorkspaceManifest[] = [experimental, {
      dir: 'packages/core/test-only',
      manifest: {
        name: '@akashx/akx-test-only',
        devDependencies: { '@akashx/akx-experimental-prototype': 'workspace:^' },
      },
    }, {
      dir: 'packages/experimental/consumer',
      manifest: {
        name: '@akashx/akx-experimental-consumer',
        dependencies: { '@akashx/akx-experimental-prototype': 'workspace:^' },
      },
    }, {
      dir: 'python/sdk-runtime',
      manifest: {
        name: '@akashx/akx-python-runtime',
        dependencies: { '@akashx/akx-experimental-prototype': 'workspace:^' },
      },
    }]

    expect(checkExperimentalDependencyIsolation(manifests)).toEqual([
      '@akashx/akx-python-runtime: dependencies.@akashx/akx-experimental-prototype must not reference an experimental package',
    ])
  })
})

describe('akx family version coherence', () => {
  it('rejects a package carrying a stale shared version', () => {
    expect(checkAkxFamilyVersion(
      { name: '@akashx/akx-http-proxy', version: '0.1.2-alpha.5' },
      '0.1.2-rc.1',
    )).toBe('@akashx/akx-http-proxy: package.json version must match root version 0.1.2-rc.1')
  })

  it('rejects the root-named CLI app on a stale shared version', () => {
    expect(checkAkxFamilyVersion(
      { name: '@akashx/akx', version: '0.1.2-alpha.5' },
      '0.1.2-rc.1',
    )).toBe('@akashx/akx: package.json version must match root version 0.1.2-rc.1')
  })

  it('accepts a manifest carrying the shared version', () => {
    expect(checkAkxFamilyVersion(
      { name: '@akashx/akx-http-proxy', version: '0.1.2-rc.1' },
      '0.1.2-rc.1',
    )).toBeUndefined()
  })

  it('leaves other sequences to their own version lines', () => {
    expect(checkAkxFamilyVersion({ name: '@akashx/cordis', version: '4.0.1' }, '0.1.2-rc.1')).toBeUndefined()
    expect(checkAkxFamilyVersion(
      { name: '@akashx/node-addon-system', version: '0.1.1' },
      '0.1.2-rc.1',
    )).toBeUndefined()
    expect(checkAkxFamilyVersion({ version: '0.1.2-alpha.5' }, '0.1.2-rc.1')).toBeUndefined()
  })
})

describe('package payload constraints', () => {
  it('includes a declared profile patch without a package-name allowlist', () => {
    expect(expectedAkxPackageFiles({
      name: '@akashx/akx-private-profile',
      akx: { bundle: { patch: './cordis.patch.yml' } },
    })).toEqual([
      'lib/index.js',
      'cordis.patch.yml',
      'lib/types/**/*.d.ts',
    ])
  })
})
