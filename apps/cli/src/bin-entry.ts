#!/usr/bin/env node
/**
 * Executable entry for the AkashX-compatible launcher.
 * @module @akashx/akx/bin-entry
 */

import { runCli } from './bin.ts'

if (import.meta.main) {
  await runCli()
}
