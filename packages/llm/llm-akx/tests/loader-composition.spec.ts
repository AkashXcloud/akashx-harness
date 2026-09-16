/**
 * Real-composition guard for the dynamic-configuration chain: LlmRuntime,
 * settings-file, credentials-local, and llm-akx boot from a test-only
 * cordis.yml through the actual Loader + Include path, external edits of
 * settings.yaml and the credentials document hot-publish through their providers, and the very
 * next request carries the fresh base URL and credential. The same adapter
 * composition without settings or credentials entries keeps entry-config
 * behavior — the documented optional-inject fallback.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@akashx/cordis'
import Loader from '@akashx/cordis-plugin-loader'
import Include from '@akashx/cordis-plugin-include'
import LlmRuntime from '@akashx/akx-llm'
import AgentRegistry from '@akashx/akx-agent'
import SessionStore, { SessionId } from '@akashx/akx-session'
import { credentialRef } from '@akashx/akx-credentials'
import LocalCredentialProvider from '@akashx/akx-credentials-local'
import FileSettingsProvider from '@akashx/akx-settings-file'
import { getOrCreateAnonymousUserId } from '@akashx/akx-anonymous-user-id'
import AkashXLlmApiExtensionRegistry from '@akashx/akx-llm-api-extensions'
import * as SessionLogAkashX from '@akashx/akx-session-log-akx'
import * as AkashXPluginPackageInventory from '@akashx/akx-plugin-package-inventory'
import * as LlmAkashX from '@akashx/akx-llm-akx'
import { assemble } from './assemble.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

const NS = 'llm-akx'
const KEY_REF = credentialRef('AKASHX_API_KEY')

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  await closeMockServers()
  vi.unstubAllEnvs()
})

async function loadComposition(
  options: { withDynamic: boolean; baseURL: string; reuseRoot?: string; enableSessionLog?: boolean },
): Promise<{ ctx: Context; settingsPath: string; credentialsPath: string }> {
  // A reused root is the restart case: the same harness home, its documents
  // exactly as the previous process left them.
  const fresh = options.reuseRoot === undefined
  root = options.reuseRoot ?? await mkdtemp(join(tmpdir(), 'akx-llm-composition-'))
  vi.stubEnv('AKX_HOME', root)
  const settingsPath = join(root, 'settings.yaml')
  const credentialsPath = join(root, '.credentials.yaml')
  if (options.withDynamic && fresh) {
    await writeFile(settingsPath, '# personal settings\n')
    await writeFile(credentialsPath, 'version: 1\nrefs:\n  AKASHX_API_KEY: boot-key\n', { mode: 0o600 })
  }

  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: llm',
    "  name: '@akashx/akx-llm'",
    '- id: session',
    "  name: '@akashx/akx-session'",
    '- id: agents',
    "  name: '@akashx/akx-agent'",
    '- id: llm-api-extensions',
    "  name: '@akashx/akx-llm-api-extensions'",
    '- id: session-log-akx',
    "  name: '@akashx/akx-session-log-akx'",
    ...options.enableSessionLog === true
      ? ['  config:', '    enabled: true']
      : [],
    '- id: plugin-package-inventory',
    "  name: '@akashx/akx-plugin-package-inventory'",
    ...options.withDynamic
      ? [
        '- id: settings',
        "  name: '@akashx/akx-settings-file'",
        '  config:',
        `    path: ${JSON.stringify(settingsPath)}`,
        '    debounceMs: 10',
        '- id: credentials',
        "  name: '@akashx/akx-credentials-local'",
        '  config:',
        `    path: ${JSON.stringify(credentialsPath)}`,
        '    debounceMs: 10',
      ]
      : [],
    '- id: llm-akx',
    "  name: '@akashx/akx-llm-akx'",
    '  config:',
    `    baseURL: ${JSON.stringify(options.baseURL)}`,
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@akashx/akx-llm', LlmRuntime],
    ['@akashx/akx-session', SessionStore],
    ['@akashx/akx-agent', AgentRegistry],
    ['@akashx/akx-llm-api-extensions', AkashXLlmApiExtensionRegistry],
    ['@akashx/akx-session-log-akx', SessionLogAkashX],
    ['@akashx/akx-plugin-package-inventory', AkashXPluginPackageInventory],
    ['@akashx/akx-settings-file', FileSettingsProvider],
    ['@akashx/akx-credentials-local', LocalCredentialProvider],
    ['@akashx/akx-llm-akx', LlmAkashX],
  ])
  // The custom importer bypasses Node resolution; mirror the package manifests
  // a deployed cordis.yml has beside its declared dependencies.
  await Promise.all([...modules.keys()].map(async (packageName) => {
    const packageDir = join(root!, 'node_modules', ...packageName.split('/'))
    await mkdir(packageDir, { recursive: true })
    await writeFile(join(packageDir, 'package.json'), `${JSON.stringify({
      name: packageName,
      version: '0.1.0-rc.8',
      type: 'module',
    })}\n`)
  }))
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return { ctx, settingsPath, credentialsPath }
}

describe('llm-akx real dynamic composition', () => {
  it('keeps session upload off and package inventory on by default in the real Loader composition', async () => {
    vi.stubEnv('AKASHX_API_KEY', 'entry-key')
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx } = await loadComposition({ withDynamic: false, baseURL: server.url })
    const session = ctx.sessions.create(SessionId('extension-composition'))
    session.append('turn/start', { turn: 1 })

    await assemble(ctx, { model: 'akashx-v4-flash', messages: [], sessionId: session.id })
    const request = server.requests[0] as { akx_plugin_packages: { version: number; packages: unknown[] } }
    expect(request).not.toHaveProperty('akx_session_log')
    expect(request.akx_plugin_packages.packages).toEqual(expect.arrayContaining([
      { name: '@akashx/akx-llm-api-extensions', version: '0.1.0-rc.8' },
      { name: '@akashx/akx-llm-akx', version: '0.1.0-rc.8' },
      { name: '@akashx/akx-session-log-akx', version: '0.1.0-rc.8' },
    ]))
    expect(request.akx_plugin_packages.version).toBe(1)
    expect(SessionLogAkashX.acceptedThrough(session)).toBe(-1)
  })

  it('sends the canonical session suffix when the Loader composition explicitly enables upload', async () => {
    vi.stubEnv('AKASHX_API_KEY', 'entry-key')
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx } = await loadComposition({
      withDynamic: false,
      baseURL: server.url,
      enableSessionLog: true,
    })
    const session = ctx.sessions.create(SessionId('extension-composition-enabled'))
    session.append('turn/start', { turn: 1 })

    await assemble(ctx, { model: 'akashx-v4-flash', messages: [], sessionId: session.id })
    const request = server.requests[0] as {
      akx_session_log?: {
        version: number
        session: { id: string }
        afterSeq: number
        throughSeq: number
        events: Array<{ type: string; seq: number }>
      }
    }
    expect(request.akx_session_log).toMatchObject({
      version: 1,
      session: { id: 'extension-composition-enabled' },
      afterSeq: -1,
      throughSeq: 0,
      events: [{ type: 'turn/start', seq: 0 }],
    })
    expect(SessionLogAkashX.acceptedThrough(session)).toBe(0)
  })

  it('boots from cordis.yml and routes the next request after external settings and credential edits', async () => {
    vi.stubEnv('AKASHX_API_KEY', '')
    const serverA = await mockServer([{ kind: 'sse', events: textEvents }])
    const serverB = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx, settingsPath, credentialsPath } = await loadComposition({ withDynamic: true, baseURL: serverA.url })

    expect(ctx.get('settings')!.describe().map(entry => entry.ns)).toEqual([NS])
    await assemble(ctx, { model: 'akashx-v4-flash', messages: [] })
    expect(serverA.headers[0]?.authorization).toBe('Bearer boot-key')
    expect(serverA.headers[0]?.['x-akx-harness-user-id']).toBe(getOrCreateAnonymousUserId())

    // External edits, exactly as a user or the web UI would leave them on disk.
    await writeFile(settingsPath, `llm-akx:\n  baseURL: ${serverB.url}\n`)
    await vi.waitFor(() => {
      expect((ctx.get('settings')!.get(NS) as { baseURL?: string }).baseURL).toBe(serverB.url)
    }, { timeout: 5000 })
    await writeFile(credentialsPath, 'version: 1\nrefs:\n  AKASHX_API_KEY: rotated-key\n', { mode: 0o600 })
    await vi.waitFor(async () => {
      expect(await ctx.get('credentials')!.resolve(KEY_REF)).toEqual({ value: 'rotated-key', source: 'file' })
    }, { timeout: 5000 })

    await assemble(ctx, { model: 'akashx-v4-flash', messages: [] })
    expect(serverA.requests).toHaveLength(1)
    expect(serverB.headers[0]?.authorization).toBe('Bearer rotated-key')
  })

  it('keeps a stored key writable and rotatable across a real restart', async () => {
    // No ambient AKASHX_API_KEY: the shipped surfaces do not hoist
    // the credentials document into process.env, so a stored key must stay file-sourced.
    vi.stubEnv('AKASHX_API_KEY', '')
    const first = await mockServer([{ kind: 'sse', events: textEvents }])
    const second = await mockServer([{ kind: 'sse', events: textEvents }])
    const boot = await loadComposition({ withDynamic: true, baseURL: first.url })
    const home = root!
    await boot.ctx.get('credentials')!.set(KEY_REF, 'stored-by-ui')
    expect(await boot.ctx.get('credentials')!.describe(KEY_REF))
      .toEqual({ configured: true, source: 'file', writable: true })
    await assemble(boot.ctx, { model: 'akashx-v4-flash', messages: [] })
    expect(first.headers[0]?.authorization).toBe('Bearer stored-by-ui')
    await boot.ctx.fiber.dispose()
    context = undefined

    // Restart over the same harness home.
    const restarted = await loadComposition({ withDynamic: true, baseURL: second.url, reuseRoot: home })
    const credentials = restarted.ctx.get('credentials')!
    // The stored key is still the provider's own writable file entry — not a
    // read-only launch override, which is what hoisting it would have made it.
    expect(await credentials.resolve(KEY_REF)).toEqual({ value: 'stored-by-ui', source: 'file' })
    expect(await credentials.describe(KEY_REF)).toEqual({ configured: true, source: 'file', writable: true })
    // Rotation still works after the restart, and the next request uses it.
    await credentials.set(KEY_REF, 'rotated-after-restart')
    await assemble(restarted.ctx, { model: 'akashx-v4-flash', messages: [] })
    expect(second.headers[0]?.authorization).toBe('Bearer rotated-after-restart')
  })

  it('boots the same adapter on entry config alone, resolving the reference from the environment', async () => {
    // No settings and no credentials provider: configuration carries only the
    // reference, so the environment is the whole credential plane here.
    vi.stubEnv('AKASHX_API_KEY', 'entry-key')
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx } = await loadComposition({ withDynamic: false, baseURL: server.url })

    expect(ctx.get('settings')).toBeUndefined()
    expect(ctx.get('credentials')).toBeUndefined()
    await assemble(ctx, { model: 'akashx-v4-flash', messages: [] })
    expect(server.headers[0]?.authorization).toBe('Bearer entry-key')
  })
})
