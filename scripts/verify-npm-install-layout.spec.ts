import { describe, expect, it } from 'vitest'
import type { NpmPackageLock, RegistryIndex } from './benchmark-npm-resolution.ts'
import {
  assertDualAkxInstallLayout,
  buildDualAkxRegistry,
} from './verify-npm-install-layout.ts'

function validLayout(): NpmPackageLock {
  return {
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { '@akashx/akx': '0.2.0', 'akx-previous': 'npm:@akashx/akx@0.1.0' } },
      'node_modules/@akashx/cordis': { version: '4.0.1' },
      'node_modules/@akashx/akx': {
        version: '0.2.0',
        dependencies: { '@akashx/akx-child': '^0.2.0' },
        peerDependencies: { '@akashx/cordis': '^4.0.1' },
      },
      'node_modules/@akashx/akx-child': {
        version: '0.2.0',
        dependencies: { '@akashx/akx-leaf': '^0.2.0' },
      },
      'node_modules/@akashx/akx-leaf': { version: '0.2.0' },
      'node_modules/akx-previous': {
        name: '@akashx/akx',
        version: '0.1.0',
        dependencies: { '@akashx/akx-child': '^0.1.0' },
        peerDependencies: { '@akashx/cordis': '^4.0.1' },
      },
      'node_modules/akx-previous/node_modules/@akashx/akx-child': {
        version: '0.1.0',
        dependencies: { '@akashx/akx-leaf': '^0.1.0' },
      },
      'node_modules/akx-previous/node_modules/@akashx/akx-leaf': { version: '0.1.0' },
    },
  }
}

describe('npm install layout verifier', () => {
  it('creates two incompatible versions of every AKX package', () => {
    const index: RegistryIndex = new Map([
      ['@akashx/akx', new Map([['0.1.1-rc.2', {
        name: '@akashx/akx',
        version: '0.1.1-rc.2',
        dependencies: { '@akashx/akx-child': '^0.1.1-rc.2' },
        peerDependencies: { '@akashx/cordis': '^4.0.1' },
      }]])],
      ['@akashx/akx-child', new Map([['0.1.1-rc.2', {
        name: '@akashx/akx-child',
        version: '0.1.1-rc.2',
      }]])],
      ['@akashx/cordis', new Map([['4.0.1', {
        name: '@akashx/cordis',
        version: '4.0.1',
      }]])],
    ])

    const dual = buildDualAkxRegistry(index, '0.1.1-rc.2')

    expect([...dual.get('@akashx/akx')?.keys() ?? []]).toEqual(['0.1.0', '0.2.0'])
    expect(dual.get('@akashx/akx')?.get('0.1.0')).toMatchObject({
      version: '0.1.0',
      dependencies: { '@akashx/akx-child': '^0.1.0' },
      peerDependencies: { '@akashx/cordis': '^4.0.1' },
    })
    expect(dual.get('@akashx/akx')?.get('0.2.0')).toMatchObject({
      version: '0.2.0',
      dependencies: { '@akashx/akx-child': '^0.2.0' },
    })
    expect(dual.get('@akashx/cordis')).toBe(index.get('@akashx/cordis'))
  })

  it('accepts isolated AKX releases with one shared Cordis installation', () => {
    expect(assertDualAkxInstallLayout(validLayout())).toEqual({
      akxPackagesPerVersion: 3,
      checkedAkxEdges: 4,
    })
  })

  it.each([
    ['react', 'node_modules/react'],
    ['react-dom', 'node_modules/react-dom'],
    ['react', 'node_modules/akx-previous/node_modules/react'],
    ['react-dom', 'node_modules/akx-previous/node_modules/react-dom'],
  ])('rejects browser runtime %s installed at %s in the AKX-only consumer', (name, path) => {
    const layout = validLayout()
    const packages = { ...layout.packages, [path]: { version: '18.3.1' } }
    expect(() => assertDualAkxInstallLayout({ ...layout, packages })).toThrow(
      `${path}: ${name} is a browser build input`,
    )
  })

  it('rejects an internal edge that crosses release versions', () => {
    const layout = validLayout()
    const packages = { ...layout.packages }
    Reflect.deleteProperty(packages, 'node_modules/akx-previous/node_modules/@akashx/akx-leaf')

    expect(() => assertDualAkxInstallLayout({ ...layout, packages })).toThrow(
      'node_modules/akx-previous/node_modules/@akashx/akx-child: dependencies '
      + '@akashx/akx-leaf resolves to node_modules/@akashx/akx-leaf@0.2.0, expected 0.1.0',
    )
  })

  it('rejects a second Cordis installation', () => {
    const layout = validLayout()
    const packages = {
      ...layout.packages,
      'node_modules/akx-previous/node_modules/@akashx/cordis': { version: '4.0.1' },
    }

    expect(() => assertDualAkxInstallLayout({ ...layout, packages })).toThrow(
      'expected one shared @akashx/cordis',
    )
  })
})
