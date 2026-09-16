import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DESKTOP_PACKAGES_DIR,
  DESKTOP_PACKAGE_SET_FILE,
  desktopCorePackageOverrides,
  desktopAkxPackageSpec,
  parseDesktopCorePackageSet,
  verifyDesktopCoreLockfile,
  verifyDesktopCorePackageSet,
  type DesktopCorePackageRecord,
} from '../src/core-package-set.ts'

const roots: string[] = []

function record(name: string, file: string, body: Buffer, version = '1.2.3'): DesktopCorePackageRecord {
  return {
    name,
    version,
    file,
    bytes: body.byteLength,
    integrity: `sha512-${createHash('sha512').update(body).digest('base64')}`,
  }
}

function packageSetProject(): {
  root: string
  akx: DesktopCorePackageRecord
  base: DesktopCorePackageRecord
  host: DesktopCorePackageRecord
} {
  const root = mkdtempSync(join(tmpdir(), 'akx-desktop-package-set-'))
  roots.push(root)
  const packageDir = join(root, DESKTOP_PACKAGES_DIR)
  mkdirSync(packageDir)
  const akxBody = Buffer.from('akx')
  const baseBody = Buffer.from('base')
  const hostBody = Buffer.from('host')
  const akx = record('@akashx/akx', 'akx.tgz', akxBody)
  const base = record('@akashx/akx-base', 'akx-base.tgz', baseBody)
  const host = record('@akashx/akx-desktop-host', 'akx-desktop-host.tgz', hostBody)
  writeFileSync(join(packageDir, akx.file), akxBody)
  writeFileSync(join(packageDir, base.file), baseBody)
  writeFileSync(join(packageDir, host.file), hostBody)
  writeFileSync(join(root, DESKTOP_PACKAGE_SET_FILE), `${JSON.stringify({
    schemaVersion: 1,
    packages: [akx, base, host],
  })}\n`)
  return { root, akx, base, host }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('desktop core package set', () => {
  it('pins the direct akx dependency and every internal package to local tarballs', () => {
    const { root } = packageSetProject()
    const packageSet = verifyDesktopCorePackageSet(root, '1.2.3')
    expect(desktopAkxPackageSpec(packageSet)).toBe('file:./desktop-packages/akx.tgz')
    expect(desktopCorePackageOverrides(packageSet)).toEqual({
      '@akashx/akx': 'file:./desktop-packages/akx.tgz',
      '@akashx/akx-base': 'file:./desktop-packages/akx-base.tgz',
      '@akashx/akx-desktop-host': 'file:./desktop-packages/akx-desktop-host.tgz',
    })
  })

  it('rejects version drift, descriptor disorder, corruption, and extra files', () => {
    const { root, akx, base, host } = packageSetProject()
    expect(() => verifyDesktopCorePackageSet(root, '2.0.0')).toThrow(/does not match Desktop/u)
    expect(() => parseDesktopCorePackageSet({
      schemaVersion: 1,
      packages: [akx, base, { ...host, version: '2.0.0' }],
    }, '1.2.3')).toThrow(/akx-desktop-host@2\.0\.0 does not match Desktop 1\.2\.3/u)
    expect(() => parseDesktopCorePackageSet({ schemaVersion: 1, packages: [base, akx, host] }))
      .toThrow(/sorted by name/u)
    writeFileSync(join(root, DESKTOP_PACKAGES_DIR, akx.file), 'changed')
    expect(() => verifyDesktopCorePackageSet(root, '1.2.3')).toThrow(/integrity check failed/u)
    writeFileSync(join(root, DESKTOP_PACKAGES_DIR, 'extra.tgz'), '')
    expect(() => verifyDesktopCorePackageSet(root, '1.2.3')).toThrow(/does not match its descriptor/u)
  })

  it('rejects registry resolutions for names supplied by the local package set', () => {
    const akx = record('@akashx/akx', 'akx.tgz', Buffer.from('akx'))
    const host = record('@akashx/akx-desktop-host', 'host.tgz', Buffer.from('host'))
    const packageSet = parseDesktopCorePackageSet({ schemaVersion: 1, packages: [akx, host] })
    expect(() => {
      verifyDesktopCoreLockfile(
        "packages:\n  '@akashx/akx@file:desktop-packages/akx.tgz':\n    resolution: {}\n",
        packageSet,
      )
    }).not.toThrow()
    expect(() => {
      verifyDesktopCoreLockfile(
        "packages:\n  '@akashx/akx@1.2.3':\n    resolution: {integrity: sha512-registry}\n",
        packageSet,
      )
    }).toThrow(/outside the local package set/u)
  })
})
