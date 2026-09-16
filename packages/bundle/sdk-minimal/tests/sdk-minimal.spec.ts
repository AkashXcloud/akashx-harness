/** The standalone SDK-minimal bundle's complete declared Cordis tree. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { entryListSchema } from '@akashx/cordis-plugin-include'

function packageName(specifier: string): string {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!
}

describe('akx-sdk-minimal bundle', () => {
  it('declares one standalone allowlisted tree with every row dependency', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      akx?: { bundle?: { patch?: string } }
    }
    expect(manifest.akx?.bundle?.patch).toBe('./cordis.patch.yml')
    const patches = yaml.load(
      readFileSync(resolve(root, manifest.akx!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as Array<{ insert?: Array<{ id?: string; inject?: string[]; name?: string; config?: Record<string, unknown>; disabled?: unknown }> }>
    expect(patches).toHaveLength(1)
    const rows = patches[0]?.insert ?? []
    expect(rows.map(row => [row.id, row.name])).toEqual([
      ['sdk-app-startup', '@akashx/akx-sdk-app'],
      ['sdk-jsonrpc-server', '@akashx/akx-sdk-jsonrpc-server'],
      ['llm-api-extensions', '@akashx/akx-llm-api-extensions'],
      ['session-log-akx', '@akashx/akx-session-log-akx'],
      ['plugin-package-inventory', '@akashx/akx-plugin-package-inventory'],
      ['llm-akx', '@akashx/akx-llm-akx'],
      ['sandbox', '@akashx/akx-sandbox-local'],
      ['session-projection', '@akashx/akx-session-projection'],
      ['sandbox-policy', '@akashx/akx-sandbox-policy'],
      ['subprocess', '@akashx/akx-subprocess-local'],
      ['pty', '@akashx/akx-terminal'],
      ['terminal-bash', '@akashx/akx-terminal-bash'],
      ['terminal-pwsh', '@akashx/akx-terminal-bash'],
      ['timer', '@akashx/cordis-plugin-timer'],
      ['llm', '@akashx/akx-llm'],
      ['session', '@akashx/akx-session'],
      ['session-title', '@akashx/akx-session-title'],
      ['system-prompt', '@akashx/akx-system-prompt'],
      ['tools', '@akashx/akx-tools'],
      ['agent', '@akashx/akx-agent'],
      ['llm-retry', '@akashx/akx-llm-retry'],
      ['jobs', '@akashx/akx-jobs-local'],
      ['invariants', '@akashx/akx-invariants'],
      ['session-invariant', '@akashx/akx-session/invariant'],
      ['agent-invariant', '@akashx/akx-agent/invariant'],
      ['scope-invariant', '@akashx/akx-scope/invariant'],
      ['agent-loop-invariant', '@akashx/akx-agent-loop/invariant'],
      ['agent-loop', '@akashx/akx-agent-loop'],
      ['persistent-bash', '@akashx/akx-tool-bash-persistent'],
      ['persistent-pwsh', '@akashx/akx-tool-pwsh-persistent'],
      ['sessions', '@akashx/akx-session-persistence-jsonl'],
    ])
    expect(rows.find(row => row.id === 'sdk-app-startup')?.config).toEqual({ profile: 'sdk-minimal' })
    expect(rows.find(row => row.id === 'sdk-jsonrpc-server')).toMatchObject({
      inject: ['sdkAppStartup', 'loader'],
      config: { maxTokensAsSuccess: false },
    })
    expect(rows.find(row => row.id === 'llm-akx')?.config).toEqual({
      apiKeyEnv: 'AKASHX_API_KEY',
      defaultContextWindow: { __jsExpr: 'Number(process.env.AKX_CONTEXT_WINDOW ?? 1000000)' },
      streamIdleTimeoutMs: 172800000,
    })
    expect(rows.find(row => row.id === 'system-prompt')?.config).toEqual({
      includeHarnessIdentity: false,
      includeRuntimeContext: false,
      personaPrefix: { __jsExpr: "process.env.AKX_SYSTEM_PROMPT ?? 'You are a helpful software engineer assistant.'" },
    })
    expect(rows.find(row => row.id === 'agent-loop')?.config).toEqual({ agents: [] })
    expect(rows.find(row => row.id === 'terminal-bash')).toMatchObject({
      disabled: { __jsExpr: "process.platform === 'win32'" },
    })
    expect(rows.find(row => row.id === 'terminal-pwsh')).toMatchObject({
      disabled: { __jsExpr: "process.platform !== 'win32'" },
      config: { shellDialect: 'pwsh', timeoutMs: 300000 },
    })
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(
      [...new Set(rows.map(row => row.name).filter((name): name is string => name !== undefined).map(packageName))].sort(),
    )
  })
})
