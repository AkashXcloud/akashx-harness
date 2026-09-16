import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_AKX_HOME_DISPLAY,
  AKX_HOME_DIR_NAME,
  canonicalizeWatchPath,
  defaultAkxHome,
  akxCachePath,
  akxHomeDisplay,
  akxHomePath,
  expandHomePath,
  resolveAkxHome,
} from '@akashx/akx-home-paths'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('akx path helpers', () => {
  it('owns the shared default AKX home directory name', () => {
    expect(AKX_HOME_DIR_NAME).toBe('.akx')
    expect(DEFAULT_AKX_HOME_DISPLAY).toBe('~/.akx')
    expect(defaultAkxHome()).toBe(join(homedir(), '.akx'))
  })

  it('expands tilde paths without changing non-tilde paths', () => {
    expect(expandHomePath('~')).toBe(homedir())
    expect(expandHomePath('~/.akx')).toBe(join(homedir(), '.akx'))
    expect(expandHomePath('~\\.akx')).toBe(join(homedir(), '.akx'))
    expect(expandHomePath('/tmp/.akx')).toBe('/tmp/.akx')
    expect(expandHomePath('~other/.akx')).toBe('~other/.akx')
  })

  it('resolves explicit path before AKX_HOME and the default', () => {
    const envHome = join(homedir(), 'env-akx')

    expect(resolveAkxHome('/tmp/explicit-akx', { AKX_HOME: '~/env-akx' })).toBe(resolve('/tmp/explicit-akx'))
    expect(resolveAkxHome(undefined, { AKX_HOME: '~/env-akx' })).toBe(envHome)
    expect(resolveAkxHome(undefined, {})).toBe(defaultAkxHome())
  })

  it('treats an empty or whitespace-only AKX_HOME as unset', () => {
    expect(resolveAkxHome(undefined, { AKX_HOME: '' })).toBe(defaultAkxHome())
    expect(resolveAkxHome(undefined, { AKX_HOME: '   ' })).toBe(defaultAkxHome())
  })

  it('joins child segments onto the resolved AKX_HOME', () => {
    vi.stubEnv('AKX_HOME', '~/env-akx')
    expect(akxHomePath()).toBe(join(homedir(), 'env-akx'))
    expect(akxHomePath('storages', 'cache')).toBe(join(homedir(), 'env-akx', 'storages', 'cache'))
  })

  it('labels a resolved home by whether it is the default root', () => {
    expect(akxHomeDisplay(resolve(defaultAkxHome()))).toBe('~/.akx')
    expect(akxHomeDisplay('/some/other/root')).toBe('$AKX_HOME')
  })

  it.each([
    [undefined, join(homedir(), '.akx')],
    ['', join(homedir(), '.akx')],
    ['   ', join(homedir(), '.akx')],
    ['~/env-akx', join(homedir(), 'env-akx')],
    ['./relative-akx', resolve('./relative-akx')],
  ] as const)('resolves cache paths with AKX_HOME=%j', (home, expectedHome) => {
    vi.stubEnv('AKX_HOME', home)
    try {
      expect(akxCachePath()).toBe(join(expectedHome, 'cache'))
      expect(akxCachePath('models', 'index.json')).toBe(join(expectedHome, 'cache', 'models', 'index.json'))
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('resolves configured cache homes before the environment', () => {
    vi.stubEnv('AKX_HOME', '~/env-akx')
    try {
      expect(akxCachePath({ akxHome: '~/explicit-akx' })).toBe(join(homedir(), 'explicit-akx', 'cache'))
      expect(akxCachePath({ akxHome: './explicit-akx' }, 'attachments', 'request-images'))
        .toBe(resolve('./explicit-akx/cache/attachments/request-images'))
      expect(akxCachePath({}, 'attachments')).toBe(join(homedir(), 'env-akx', 'cache', 'attachments'))
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('canonicalizes a watcher ancestor while preserving a missing suffix', async () => {
    const root = await mkdtemp(join(tmpdir(), 'akx-watch-path-'))
    const target = join(root, 'target')
    const alias = join(root, 'alias')
    try {
      await mkdir(target)
      await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(canonicalizeWatchPath(alias)).resolves.toBe(await realpath(target))
      await expect(canonicalizeWatchPath(join(alias, 'later', 'config.yml'))).resolves.toBe(
        join(await realpath(target), 'later', 'config.yml'),
      )
      const file = join(root, 'file')
      await writeFile(file, 'not a directory')
      await expect(canonicalizeWatchPath(join(file, 'child'))).rejects.toMatchObject({ code: 'ENOTDIR' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
