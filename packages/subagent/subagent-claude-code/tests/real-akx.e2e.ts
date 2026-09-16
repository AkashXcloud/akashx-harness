import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { Context } from '@akashx/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '@akashx/akx-agent'
import SubagentRuntime from '@akashx/akx-subagent'
import SessionProjectionRegistry from '@akashx/akx-session-projection'
import type { SubprocessHandle } from '@akashx/akx-subprocess'
import LocalSubprocessRuntime from '@akashx/akx-subprocess-local'
import * as claudeCode from '../src/index.ts'

const execFileAsync = promisify(execFile)
const OFFICIAL_AKASHX_BASE_URL = 'https://api.akashx.com'
const AKASHX_MODEL = 'akashx-v4-flash'
const sdkRoot = dirname(fileURLToPath(
  import.meta.resolve('@anthropic-ai/claude-agent-sdk'),
))
const sdkPackage = JSON.parse(readFileSync(
  join(sdkRoot, 'package.json'),
  'utf8',
)) as {
  version: string
  claudeCodeVersion: string
  optionalDependencies: Record<string, string>
}
const platformPackage = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`
const platformRoot = resolve(sdkRoot, '..', platformPackage.split('/')[1]!)
const claudeBin = join(
  platformRoot,
  process.platform === 'win32' ? 'claude.exe' : 'claude',
)

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function deepSeekBaseUrl(): string {
  const configured = (process.env.AKASHX_BASE_URL ?? OFFICIAL_AKASHX_BASE_URL)
    .replace(/\/+$/, '')
  if (configured !== OFFICIAL_AKASHX_BASE_URL) {
    throw new Error('Claude Code AkashX e2e requires the official AkashX base URL')
  }
  return configured
}

async function expectQuiescent(handles: readonly SubprocessHandle[]): Promise<void> {
  expect(handles.length).toBeGreaterThan(0)
  for (const handle of handles) {
    await expect(handle.waitForExit()).resolves.toBe(true)
    await expect(handle.done).resolves.toHaveProperty('exitCode')
  }
}

describe.skipIf(!process.env.AKASHX_API_KEY)(
  'Claude Code provider with real AkashX API',
  () => {
    it('returns one unique nonce through the production provider and real SDK/CLI', async () => {
      const apiKey = process.env.AKASHX_API_KEY
      if (apiKey === undefined) throw new Error('e2e ran without AKASHX_API_KEY')
      const root = mkdtempSync(join(tmpdir(), 'akx-claude-akashx-e2e-'))
      roots.push(root)
      const workspace = join(root, 'workspace')
      const claudeConfig = join(root, 'claude-config')
      const xdgConfig = join(root, 'xdg-config')
      const xdgCache = join(root, 'xdg-cache')
      const xdgData = join(root, 'xdg-data')
      const xdgState = join(root, 'xdg-state')
      for (const directory of [
        workspace,
        claudeConfig,
        xdgConfig,
        xdgCache,
        xdgData,
        xdgState,
      ]) mkdirSync(directory)

      const env = {
        ANTHROPIC_AUTH_TOKEN: apiKey,
        ANTHROPIC_BASE_URL: `${deepSeekBaseUrl()}/anthropic`,
        ANTHROPIC_MODEL: AKASHX_MODEL,
        ANTHROPIC_DEFAULT_OPUS_MODEL: AKASHX_MODEL,
        ANTHROPIC_DEFAULT_SONNET_MODEL: AKASHX_MODEL,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: AKASHX_MODEL,
        CLAUDE_CODE_SUBAGENT_MODEL: AKASHX_MODEL,
        CLAUDE_CODE_EFFORT_LEVEL: 'max',
        CLAUDE_CONFIG_DIR: claudeConfig,
        HOME: root,
        XDG_CONFIG_HOME: xdgConfig,
        XDG_CACHE_HOME: xdgCache,
        XDG_DATA_HOME: xdgData,
        XDG_STATE_HOME: xdgState,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL: '1',
        DISABLE_TELEMETRY: '1',
        DISABLE_ERROR_REPORTING: '1',
        HTTP_PROXY: '',
        HTTPS_PROXY: '',
        ALL_PROXY: '',
        NO_PROXY: '127.0.0.1,localhost',
      }
      const ctx = new Context()
      contexts.push(ctx)
      await ctx.plugin(SessionProjectionRegistry)
      await ctx.plugin(SubagentRuntime)
      await ctx.plugin(LocalSubprocessRuntime)
      const handles: SubprocessHandle[] = []
      const spawn = ctx.subprocess.spawn.bind(ctx.subprocess)
      vi.spyOn(ctx.subprocess, 'spawn').mockImplementation((spec) => {
        const handle = spawn(spec)
        handles.push(handle)
        return handle
      })
      await ctx.plugin(claudeCode, { env, disposeGraceMs: 3_000 })

      expect(sdkPackage.version).toBe('0.3.263')
      expect(sdkPackage.claudeCodeVersion).toBe('2.1.263')
      expect(sdkPackage.optionalDependencies[platformPackage]).toBe('0.3.263')
      const version = await execFileAsync(claudeBin, ['--version'], {
        env: { ...process.env, ...env },
      })
      expect(version.stdout.trim()).toBe('2.1.263 (Claude Code)')

      const nonce = `AKX_CLAUDE_AKASHX_${randomUUID()}`
      const parent = {
        id: 'akashx-e2e-parent',
        session: { header: { cwd: workspace } },
      } as unknown as Agent
      const run = await ctx.subagents.start('claude-code', {
        prompt: [{
          type: 'text',
          text: `Reply with exactly ${nonce} and nothing else. Do not use tools.`,
        }],
        parent,
        signal: new AbortController().signal,
      })
      const result = await run.result
      await run.dispose()

      expect(result.stopReason).toBe('completed')
      const text = result.output
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')
        .trim()
      expect(text).toBe(nonce)
      await expectQuiescent(handles)
    }, 180_000)
  },
)
