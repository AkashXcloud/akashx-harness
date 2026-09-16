import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareDevelopmentProject } from '../scripts/development-project.ts'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import type { DesktopRelease } from '../src/release.ts'

const roots: string[] = []

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'akx-desktop-development-test-'))
  roots.push(root)
  return root
}

function release(version = '1.2.3'): DesktopRelease {
  return {
    schemaVersion: 1,
    version,
    hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: '24.17.0',
    pnpmVersion: '11.7.0',
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('desktop development project', () => {
  it('projects the built akx and Desktop Host applications with their dependency graph', () => {
    const root = temporaryRoot()
    const cli = join(root, 'apps', 'cli')
    const host = join(root, 'apps', 'desktop-host')
    const dependencies = join(root, 'workspace-dependencies')
    mkdirSync(join(cli, 'lib'), { recursive: true })
    mkdirSync(join(host, 'lib'), { recursive: true })
    mkdirSync(join(dependencies, '@scope'), { recursive: true })
    mkdirSync(join(dependencies, '@akashx', 'akx'), { recursive: true })
    writeFileSync(join(cli, 'package.json'), '{"name":"@akashx/akx","version":"1.2.3"}\n')
    writeFileSync(join(host, 'package.json'), '{"name":"@akashx/akx-desktop-host","version":"1.2.3"}\n')
    writeFileSync(join(host, 'lib', 'index.js'), '')
    writeFileSync(join(dependencies, '@akashx', 'akx', 'package.json'), '{}\n')
    mkdirSync(join(dependencies, 'plain-dependency'))
    writeFileSync(join(dependencies, 'plain-dependency', 'package.json'), '{}\n')
    mkdirSync(join(dependencies, '@scope', 'dependency'))
    writeFileSync(join(dependencies, '@scope', 'dependency', 'package.json'), '{}\n')

    const project = prepareDevelopmentProject({
      projectDir: join(root, 'development'),
      cliDir: cli,
      hostDir: host,
      dependencyDir: dependencies,
      release: release(),
    })
    expect(realpathSync(join(project, 'node_modules', '@akashx', 'akx'))).toBe(realpathSync(cli))
    expect(realpathSync(join(project, 'node_modules', '@akashx', 'akx-desktop-host'))).toBe(realpathSync(host))
    expect(realpathSync(join(project, 'node_modules', 'plain-dependency')))
      .toBe(realpathSync(join(dependencies, 'plain-dependency')))
    expect(realpathSync(join(project, 'node_modules', '@scope', 'dependency')))
      .toBe(realpathSync(join(dependencies, '@scope', 'dependency')))
    const manifest = JSON.parse(readFileSync(join(project, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(manifest.dependencies['@akashx/akx']).toBe('1.2.3')
    expect(manifest.dependencies['@akashx/akx-desktop-host']).toBe('1.2.3')
  })

  it('rejects a CLI package from another release', () => {
    const root = temporaryRoot()
    const cli = join(root, 'apps', 'cli')
    const host = join(root, 'apps', 'desktop-host')
    const dependencies = join(root, 'workspace-dependencies')
    mkdirSync(join(cli, 'lib'), { recursive: true })
    mkdirSync(join(host, 'lib'), { recursive: true })
    mkdirSync(dependencies, { recursive: true })
    writeFileSync(join(cli, 'package.json'), '{"name":"@akashx/akx","version":"2.0.0"}\n')
    writeFileSync(join(host, 'package.json'), '{"name":"@akashx/akx-desktop-host","version":"1.2.3"}\n')
    writeFileSync(join(host, 'lib', 'index.js'), '')
    expect(() => prepareDevelopmentProject({
      projectDir: join(root, 'development'),
      cliDir: cli,
      hostDir: host,
      dependencyDir: dependencies,
      release: release(),
    })).toThrow(/must be @akashx\/akx@1\.2\.3/u)
  })
})
