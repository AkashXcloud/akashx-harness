/**
 * The shipped presets are this package's own, not an assembly fact each app
 * must patch in: a roster configured with nothing still supplies the built-in
 * compositions, prepended so they always mount and win a duplicate id.
 * `includeShippedRoot: false` is how a deployment supplying purely its own
 * presets — or an embedder using the roster as bare machinery — opts out.
 *
 * `$AKX_HOME` is repointed per test for the same reason as the user-root
 * suite: the derived writable root is resolved in the constructor.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@akashx/cordis'
import Loader from '@akashx/cordis-plugin-loader'
import Include from '@akashx/cordis-plugin-include'
import SessionProjectionRegistry from '@akashx/akx-session-projection'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AgentPresets, { SHIPPED_PRESET_ROOT, type Config } from '@akashx/akx-agent-presets'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const SYSTEM_ROOT = join(FIXTURES, 'system')

let home: string
let previousHome: string | undefined

beforeEach(async () => {
  previousHome = process.env.AKX_HOME
  home = await mkdtemp(join(tmpdir(), 'akx-shipped-root-'))
  process.env.AKX_HOME = home
})

afterEach(async () => {
  if (previousHome === undefined) delete process.env.AKX_HOME
  else process.env.AKX_HOME = previousHome
  await rm(home, { recursive: true, force: true })
})

/** Boot a roster with the shipped root left to the plugin's default. */
async function roster(config: Partial<Config> = {}): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(FIXTURES).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(AgentPresets, {
    default: 'cognate',
    roots: [],
    includeShippedRoot: true,
    includeUserRoot: true,
    ...config,
  })
  return ctx
}

describe('the shipped preset root', () => {
  it('supplies the built-in presets from a bare roster, healthy and system-trusted', async () => {
    const ctx = await roster({ includeUserRoot: false })

    const listed = await ctx.agentPresets.list()
    // One preset per isolated retrieval path, plus the one that carries them all and the
    // retired default kept so Sessions recorded under it still open.
    expect(listed.map(preset => preset.id).sort()).toEqual([
      'akashx-ecosystem', 'cognate', 'cognate-ask', 'cognate-chunks',
      'cognate-ov', 'cognate-tree', 'cognate-vector',
    ])
    expect(listed.every(preset => preset.trust === 'system')).toBe(true)
    // Not `broken === undefined`: health asks whether each row's package is
    // installed above the base, and the shipped rows name packages the
    // deployment installs beside the roster. This fixture base is not that
    // install, so unresolved rows are the only reason it can report here —
    // malformed would be a different one, and this asserts there is none.
    expect(listed.map(preset => preset.broken)
      .filter(reason => reason !== undefined && !reason.includes('cannot be resolved'))).toEqual([])
  })

  it('prepends the shipped root before configured roots and the derived user root', async () => {
    const ctx = await roster({ roots: [{ path: SYSTEM_ROOT, trust: 'user' }] })

    expect(ctx.agentPresets.roots.map(root => root.path)).toEqual([
      SHIPPED_PRESET_ROOT,
      SYSTEM_ROOT,
      expect.stringContaining('.agent-presets'),
    ])
    expect(ctx.agentPresets.roots[0]).toEqual({ path: SHIPPED_PRESET_ROOT, trust: 'system' })
    expect((await ctx.agentPresets.list()).map(preset => preset.id)).toContain('cognate')
  })

  it('mounts a roster without the shipped set when includeShippedRoot is false', async () => {
    const ctx = await roster({
      includeShippedRoot: false,
      includeUserRoot: false,
      roots: [{ path: SYSTEM_ROOT, trust: 'system' }],
    })

    expect(ctx.agentPresets.roots).toEqual([{ path: SYSTEM_ROOT, trust: 'system' }])
    const minimal = (await ctx.agentPresets.list()).find(preset => preset.id === 'minimal')
    expect(minimal?.path.startsWith(SYSTEM_ROOT)).toBe(true)
  })

})
