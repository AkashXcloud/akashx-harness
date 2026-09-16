import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'

/**
 * Keyless smoke for SOURCE launcher execution: run the source entries in
 * with the exact production runtime vector (`node --import tsx/esm`, the
 * vector the root launcher scripts invoke directly) and assert the
 * required-config diagnostic. The Node compatibility matrix runs this
 * WHOLE file, so a Node release changing module hooks or TypeScript handling
 * breaks this gate instead of every developer's `pnpm akx`; the built-bin
 * suite covers the published `lib/` entry, not this source chain.
 */

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const akxSourceBin = 'apps/cli/src/bin.ts'
const akashxSourceBin = 'apps/cli/src/akashx.ts'

describe('akx SOURCE launcher (node --import tsx/esm)', () => {
  it('launches the source CLI without building', async () => {
    const rootPackage = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8')) as {
      readonly scripts?: Record<string, string>
    }
    expect(rootPackage.scripts?.akx).toBe('node --import tsx/esm apps/cli/src/bin.ts')
    expect(rootPackage.scripts?.akashx).toBe('node --import tsx/esm apps/cli/src/akashx.ts')
  })

  it('renders the AkashX launcher name without building', async () => {
    const result = await execa(process.execPath, ['--import', 'tsx/esm', akashxSourceBin, '--help'], {
      cwd: repoRoot,
      input: '',
      timeout: 25_000,
      killSignal: 'SIGKILL',
      reject: false,
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Usage: akashx')
    expect(result.stderr).toBe('')
  }, 30_000)

  it('boots the source entry and requires a profile', async () => {
    const result = await execa(process.execPath, ['--import', 'tsx/esm', akxSourceBin], {
      cwd: repoRoot,
      input: '',
      timeout: 25_000,
      killSignal: 'SIGKILL',
      reject: false,
    })
    if (result.timedOut) {
      throw new Error(`akx source launch did not exit within 25s. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
    }
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('--profile <name> is required')
    expect(result.stdout).toBe('')
  }, 30_000)
})
