import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertDesktopHostPackageFiles,
  selectDesktopPackageClosure,
  type PackedDesktopPackage,
} from '../scripts/prepare-package-set.ts'

function packed(name: string, manifest: Record<string, unknown> = {}): PackedDesktopPackage {
  return { tarball: `${name}.tgz`, manifest: { name, version: '1.0.0', ...manifest } }
}

describe('desktop package-set selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not select a packaging target when imported as a library', async () => {
    vi.stubEnv('AKX_DESKTOP_TARGET_PLATFORM', 'linux')
    vi.stubEnv('AKX_DESKTOP_TARGET_ARCH', 'x64')
    vi.resetModules()
    await expect(import('../scripts/prepare-package-set.ts')).resolves.toHaveProperty('prepareDesktopPackageSet')
  })

  it('includes only the available internal production closure', () => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@akashx/akx', packed('@akashx/akx', {
        dependencies: { '@akashx/akx-base': '^1.0.0', external: '^2.0.0' },
        optionalDependencies: { '@akashx/platform-package': '1.0.0', '@akashx/missing-platform': '1.0.0' },
      })],
      ['@akashx/akx-desktop-host', packed('@akashx/akx-desktop-host', {
        dependencies: { '@akashx/akx': '^1.0.0' },
      })],
      ['@akashx/akx-base', packed('@akashx/akx-base', {
        peerDependencies: { '@akashx/cordis': '^1.0.0' },
      })],
      ['@akashx/cordis', packed('@akashx/cordis')],
      ['@akashx/platform-package', packed('@akashx/platform-package')],
      ['@akashx/unused', packed('@akashx/unused')],
    ])
    expect(selectDesktopPackageClosure(available).map(entry => entry.manifest.name)).toEqual([
      '@akashx/cordis',
      '@akashx/akx',
      '@akashx/akx-base',
      '@akashx/akx-desktop-host',
      '@akashx/platform-package',
    ])
  })

  it('rejects a required internal package absent from the packed release inputs', () => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@akashx/akx', packed('@akashx/akx', {
        dependencies: { '@akashx/akx-base': '^1.0.0' },
      })],
      ['@akashx/akx-desktop-host', packed('@akashx/akx-desktop-host', {
        dependencies: { '@akashx/akx': '^1.0.0' },
      })],
    ])
    expect(() => selectDesktopPackageClosure(available)).toThrow(/unpacked internal package/u)
    expect(() => selectDesktopPackageClosure(new Map([
      ['@akashx/akx', packed('@akashx/akx')],
    ]))).toThrow(/omit @akashx\/akx-desktop-host/u)
  })

  it('requires the Desktop Host entry and its packaged overlay', () => {
    const files = [
      'package/lib/index.js',
      'package/config/desktop.cordis.patch.yml',
    ]
    expect(() => {
      assertDesktopHostPackageFiles(files)
    }).not.toThrow()
    expect(() => {
      assertDesktopHostPackageFiles(files.slice(0, 1))
    }).toThrow(/desktop\.cordis\.patch\.yml/u)
    expect(() => {
      assertDesktopHostPackageFiles(files.slice(1))
    }).toThrow(/lib\/index\.js/u)
  })
})
