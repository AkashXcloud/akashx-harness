#!/usr/bin/env node
/**
 * Command-line entry for the DeepSeek-compatible and AkashX launchers.
 * @module @deepseek-ai/dsh/bin
 */

/* v8 ignore file -- built-bin acceptance exercises this self-executing dispatch. */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLayeredEnv } from '@deepseek-ai/dsh-app-boot'
import { parseDshArgs } from './args.ts'

// Both the source tree (apps/cli/src) and the bundled bin (apps/cli/lib) sit
// one directory under apps/cli, so the checked-in manifest resolves with the
// same relative hop from either artifact.
function readVersion(): string {
  const manifest = JSON.parse(
    readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  ) as { version?: unknown }
  return typeof manifest.version === 'string' ? manifest.version : '0.0.0'
}

/**
 * Run the public command-line interface.
 * @param commandName - the executable name shown in help and diagnostics.
 * @returns a promise that settles when the selected command mode finishes.
 */
export async function runCli(commandName = 'dsh'): Promise<void> {
  process.env.DSH_CLI_NAME = commandName
  if (commandName === 'akashx' && (process.env.DSH_HOME ?? '').trim() === '') {
    process.env.DSH_HOME = join(homedir(), '.akashx')
  }
  const invocation = parseDshArgs(process.argv.slice(2), readVersion(), commandName)

  switch (invocation.mode) {
    case 'profile': {
      const { runProfile } = await import('./profile-boot.ts')
      await runProfile({
        environment: loadLayeredEnv(commandName),
        binName: commandName,
        profile: invocation.profile,
        fromDefaultProfile: invocation.fromDefaultProfile,
        patchFiles: invocation.patches,
        args: invocation.args,
      })
      break
    }
    case 'plugin': {
      const { runPlugin } = await import('./plugin.ts')
      process.exit(runPlugin(invocation.profile, invocation.args, commandName))
      break
    }
    case 'dump-config': {
      const { runDumpConfig } = await import('./dump-config.ts')
      runDumpConfig(
        invocation.profile,
        invocation.defaultOnly,
        invocation.patches,
        invocation.fromDefaultProfile,
        commandName,
      )
      break
    }
    default:
      invocation satisfies never
      throw new Error(`${commandName}: unhandled invocation mode ${JSON.stringify(invocation)}`)
  }
}

if (import.meta.main) {
  await runCli()
}
