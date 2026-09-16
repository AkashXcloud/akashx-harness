import { spawnSync } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@akashx/cordis'
import Loader from '@akashx/cordis-plugin-loader'
import Include from '@akashx/cordis-plugin-include'
import { ToolCallId } from '@akashx/akx-llm'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@akashx/akx-session'
import AgentRegistry from '@akashx/akx-agent'
import SessionProjectionRegistry from '@akashx/akx-session-projection'
import type { Agent } from '@akashx/akx-agent'
import TerminalSessionService from '@akashx/akx-terminal'
import * as TerminalBash from '@akashx/akx-terminal-bash'
import SandboxProvider from '@akashx/akx-sandbox'
import type { ConfinedArgv, SandboxPolicy } from '@akashx/akx-sandbox'
import SandboxPolicyService from '@akashx/akx-sandbox-policy'
import LocalSubprocessService from '@akashx/akx-subprocess-local'
import { resolvePwshPath } from '@akashx/akx-pwsh-local/src/resolve.ts'
import SystemPrompt from '@akashx/akx-system-prompt'
import ToolRegistry from '@akashx/akx-tools'
import * as ToolPwshPersistent from '@akashx/akx-tool-pwsh-persistent'
import { unsupportedInbox } from '@akashx/akx-agent-loop-testkit'

const hasPwsh = spawnSync(
  resolvePwshPath(), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$true'],
  { encoding: 'utf8' },
).status === 0

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

class PassthroughSandbox extends SandboxProvider {
  confine(argv: readonly string[], _policy: SandboxPolicy): ConfinedArgv {
    return { argv: [...argv], enforcement: 'full', denialSignatures: [], runnerFailureRules: [] }
  }
}

function agent(ctx: Context, cwd: string): Agent {
  const id = SessionId('persistent-pwsh-loader-agent')
  const scope = ctx.plugin(() => {})
  const session = Session.create(id, [], {
    version: SESSION_FORMAT_VERSION, id, createdAt: 0, cwd, isSeeded: false,
  })
  const value: Agent = {
    id,
    options: {},
    session,
    inbox: unsupportedInbox(),
    status: 'idle',
    ctx: scope.ctx,
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject: () => {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
  ctx.agents.register(value)
  return value
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

describe.skipIf(!hasPwsh)('persistent pwsh through a real cordis.yml Loader composition', () => {
  it('preserves cwd and environment across calls', async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'akx-persistent-pwsh-loader-')))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@akashx/akx-agent'",
      "- name: '@akashx/akx-system-prompt'",
      "- name: '@akashx/akx-tools'",
      "- name: '@akashx/akx-terminal'",
      "- name: '@akashx/akx-test-sandbox'",
      "- name: '@akashx/akx-session-projection'",
      "- name: '@akashx/akx-sandbox-policy'",
      '  config:',
      '    mode: danger-full-access',
      `    workspaceRoot: ${JSON.stringify(root)}`,
      "- name: '@akashx/akx-subprocess-local'",
      "- name: '@akashx/akx-terminal-bash'",
      '  config:',
      '    shellDialect: pwsh',
      '    pollIntervalMs: 10',
      '    exactProbeAfterMs: 20',
      '    idleSilenceMs: 300',
      '    handoffGraceMs: 300',
      '    scrollbackLines: 20000',
      // The first call pays the full pwsh cold-start latency (spawn + .NET +
      // PSReadLine + Defender) inside the tool deadline; a 60s bound on the
      // fully loaded self-hosted Windows pool is exceeded often enough to
      // reset the session mid-test (2026-09-01, two runs ~62s each). 300s
      // matches the akx-tool-pwsh-persistent product default; the
      // akx-terminal-bash value bounds one send plus the complete startup
      // sequence, so it covers the same cold start (its 30s product default
      // would not).
      '    timeoutMs: 300000',
      '    disposeGraceMs: 500',
      "- name: '@akashx/akx-tool-pwsh-persistent'",
      '  config:',
      '    timeoutMs: 300000',
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@akashx/akx-agent', AgentRegistry],
      ['@akashx/akx-system-prompt', SystemPrompt],
      ['@akashx/akx-tools', ToolRegistry],
      ['@akashx/akx-terminal', TerminalSessionService],
      ['@akashx/akx-test-sandbox', PassthroughSandbox],
      ['@akashx/akx-session-projection', SessionProjectionRegistry],
      ['@akashx/akx-sandbox-policy', SandboxPolicyService],
      ['@akashx/akx-subprocess-local', LocalSubprocessService],
      ['@akashx/akx-terminal-bash', TerminalBash],
      ['@akashx/akx-tool-pwsh-persistent', ToolPwshPersistent],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    const owner = agent(context, root)
    const signal = new AbortController().signal
    const execute = (id: string, command: string) => context!.tools.execute({
      signal,
      callId: ToolCallId(id),
      name: 'pwsh',
      arguments: { command },
      agent: owner,
    })

    expect(context.tools.schemas().map(schema => schema.name)).toEqual(['pwsh'])
    await execute('state', '$env:KEEP = "loader"; New-Item -ItemType Directory -Force -Path nested | Out-Null; Set-Location nested')
    const observed = text(await execute('observe', 'Write-Output "cwd=$PWD keep=$env:KEEP"'))
    expect(observed).toContain(`cwd=${join(root, 'nested')} keep=loader`)
    expect(observed).not.toContain('AKX_PERSISTENT_PWSH')

    const multiline = text(await execute(
      'multiline',
      '$value = "line one"\nWrite-Output "${value}:it\'s fine"',
    ))
    expect(multiline).toBe("line one:it's fine")
    expect(multiline).not.toContain('AKX_PERSISTENT_PWSH')

    const hereString = text(await execute(
      'here-string',
      "$h = @'\nalpha\nbeta\n'@\nWrite-Output $h",
    ))
    expect(hereString).toBe('alpha\nbeta')

    const large = text(await execute('large-output', '1..12050 | ForEach-Object { $_ }'))
    expect(large.startsWith('1\n2\n3\n')).toBe(true)
    expect(large).toContain('<response clipped>')
    expect(large).not.toContain('beginning of this command output was dropped')

    const exited = text(await execute('exit', 'exit'))
    expect(exited).toContain('next pwsh call starts from the workspace')
    expect(text(await execute('after-exit', 'Write-Output "$PWD"'))).toBe(root)
  }, 120_000)
})
