/**
 * Registry tests for `@akashx/akx-shell-env`: built-in facts, contributor
 * ownership and validation, collection ordering, effect-scoped disposal, and
 * the explicit disposer contract.
 */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@akashx/cordis'
import { ToolCallId } from '@akashx/akx-llm'
import type { Agent } from '@akashx/akx-agent'
import { SESSION_FORMAT_VERSION } from '@akashx/akx-session'
import type { ToolExecution } from '@akashx/akx-tools'
import { ShellEnvRegistry } from '@akashx/akx-shell-env'
import * as BashEnvPlugin from '@akashx/akx-shell-env'

const testToolSignal = new AbortController().signal

afterEach(() => vi.unstubAllEnvs())

function execution(sessionId?: string): ToolExecution {
  return {
    signal: testToolSignal,
    token: Symbol('bash-env-test') as ToolExecution['token'],
    callId: ToolCallId('bash-env-call'),
    rootCallId: ToolCallId('bash-env-call'),
    name: 'bash',
    arguments: { command: 'true' },
    ...(sessionId === undefined
      ? {}
      : {
        agent: {
          session: {
            header: { version: SESSION_FORMAT_VERSION, id: sessionId, createdAt: 0, isSeeded: false },
          },
        } as unknown as Agent,
      }),
  }
}

describe('ShellEnvRegistry', () => {
  it('collects unconditional shell facts and the current agent session id', () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { akxHome: './test-akx-home' })

    expect(registry.collect(execution())).toEqual({
      AKX_HOME: resolve('./test-akx-home'),
      AKX_SHELL: '1',
    })
    expect(registry.collect(execution('session-a'))).toEqual({
      AKX_HOME: resolve('./test-akx-home'),
      AKX_SESSION_ID: 'session-a',
      AKX_SHELL: '1',
    })
  })

  it('resolves AKX_HOME from the ambient override or the user-home default', () => {
    vi.stubEnv('AKX_HOME', './ambient-akx-home')
    const fromEnvironment = new ShellEnvRegistry(new Context())
    expect(fromEnvironment.collect(execution()).AKX_HOME).toBe(resolve('./ambient-akx-home'))

    vi.stubEnv('AKX_HOME', undefined)
    const fromDefault = new ShellEnvRegistry(new Context())
    expect(fromDefault.collect(execution()).AKX_HOME).toBe(join(homedir(), '.akx'))
  })

  it('collects declared contributor variables and omits unavailable values', () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { akxHome: './test-akx-home' })
    registry.register({
      name: 'optional-session-fact',
      variables: {
        AKX_SESSION_OPTIONAL: { description: 'Optional session-scoped test fact.' },
      },
      resolve: exec => exec.agent === undefined ? {} : { AKX_SESSION_OPTIONAL: exec.agent.session.header.id },
    })
    registry.register({
      name: 'always-available-fact',
      variables: {
        AKX_ALWAYS_AVAILABLE: { description: 'Always-available test fact.' },
      },
      resolve: () => ({ AKX_ALWAYS_AVAILABLE: 'yes' }),
    })

    expect(registry.collect(execution())).not.toHaveProperty('AKX_SESSION_OPTIONAL')
    expect(registry.collect(execution()).AKX_ALWAYS_AVAILABLE).toBe('yes')
    expect(registry.collect(execution('session-b')).AKX_SESSION_OPTIONAL).toBe('session-b')
    expect(registry.list()).toEqual([
      {
        contributor: 'always-available-fact',
        description: 'Always-available test fact.',
        key: 'AKX_ALWAYS_AVAILABLE',
      },
      {
        contributor: 'optional-session-fact',
        description: 'Optional session-scoped test fact.',
        key: 'AKX_SESSION_OPTIONAL',
      },
    ])
  })

  it('rejects duplicate variable ownership at registration time', () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { akxHome: './test-akx-home' })
    registry.register({
      name: 'first',
      variables: { AKX_SHARED: { description: 'First owner.' } },
      resolve: () => ({ AKX_SHARED: 'first' }),
    })

    expect(() => registry.register({
      name: 'second',
      variables: { AKX_SHARED: { description: 'Second owner.' } },
      resolve: () => ({ AKX_SHARED: 'second' }),
    })).toThrow(/AKX_SHARED.*first.*second|AKX_SHARED.*second.*first/)
  })

  it('rejects duplicate contributor names and malformed declarations', () => {
    const registry = new ShellEnvRegistry(new Context(), { akxHome: './test-akx-home' })
    registry.register({
      name: 'declared',
      variables: { AKX_DECLARED: { description: 'Declared fact.' } },
      resolve: () => ({}),
    })

    expect(() => registry.register({
      name: 'declared',
      variables: { AKX_ANOTHER: { description: 'Another fact.' } },
      resolve: () => ({}),
    })).toThrow(/already registered/)
    expect(() => registry.register({
      name: ' ',
      variables: { AKX_BLANK_NAME: { description: 'Blank owner.' } },
      resolve: () => ({}),
    })).toThrow(/name must be non-empty/)
    expect(() => registry.register({
      name: 'invalid-key',
      variables: { akx_invalid: { description: 'Invalid key.' } } as unknown as Record<'AKX_INVALID', { description: string }>,
      resolve: () => ({}),
    })).toThrow(/invalid key/)
    expect(() => registry.register({
      name: 'reserved-key',
      variables: { AKX_HOME: { description: 'Reserved key.' } },
      resolve: () => ({}),
    })).toThrow(/reserved key/)
    expect(() => registry.register({
      name: 'blank-description',
      variables: { AKX_BLANK_DESCRIPTION: { description: ' ' } },
      resolve: () => ({}),
    })).toThrow(/must describe/)
  })

  it('rejects undeclared variables returned by a contributor', () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { akxHome: './test-akx-home' })
    registry.register({
      name: 'drifted-provider',
      variables: { AKX_DECLARED: { description: 'Declared fact.' } },
      resolve: () => ({ AKX_UNDECLARED: 'bad' }),
    })

    expect(() => registry.collect(execution())).toThrow(/drifted-provider.*AKX_UNDECLARED/)
  })

  it('rejects non-string values returned by a contributor', () => {
    const registry = new ShellEnvRegistry(new Context(), { akxHome: './test-akx-home' })
    registry.register({
      name: 'wrong-value-type',
      variables: { AKX_STRING: { description: 'String fact.' } },
      resolve: () => ({ AKX_STRING: 42 }) as unknown as Record<'AKX_STRING', string>,
    })

    expect(() => registry.collect(execution())).toThrow(/wrong-value-type.*non-string.*AKX_STRING/)
  })

  it('removes an effect-scoped contributor when its plugin is disposed', async () => {
    const ctx = new Context()
    const registry = new ShellEnvRegistry(ctx, { akxHome: './test-akx-home' })
    const fiber = await ctx.plugin({
      inject: ['shellEnv'],
      apply(inner: Context) {
        inner.shellEnv.register({
          name: 'temporary',
          variables: { AKX_TEMPORARY: { description: 'Temporary fact.' } },
          resolve: () => ({ AKX_TEMPORARY: 'present' }),
        })
      },
    })

    expect(registry.collect(execution()).AKX_TEMPORARY).toBe('present')
    await fiber.dispose()
    expect(registry.collect(execution())).not.toHaveProperty('AKX_TEMPORARY')
  })

  it('returns an explicit contributor disposer', () => {
    const registry = new ShellEnvRegistry(new Context(), { akxHome: './test-akx-home' })
    const dispose = registry.register({
      name: 'explicit-disposal',
      variables: { AKX_EXPLICIT_DISPOSAL: { description: 'Explicitly disposed fact.' } },
      resolve: () => ({ AKX_EXPLICIT_DISPOSAL: 'present' }),
    })

    expect(registry.collect(execution()).AKX_EXPLICIT_DISPOSAL).toBe('present')
    dispose()
    expect(registry.collect(execution())).not.toHaveProperty('AKX_EXPLICIT_DISPOSAL')
  })

  it('the plugin registers the service with no contributors on load', async () => {
    const ctx = new Context()
    await ctx.plugin(BashEnvPlugin)
    expect(ctx.shellEnv).toBeInstanceOf(ShellEnvRegistry)
    expect(ctx.shellEnv.list()).toEqual([])
  })
})
