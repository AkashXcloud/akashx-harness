#!/usr/bin/env node
/**
 * AkashX command-line entry point.
 * @module @akashx/akashx-harness/akashx
 */

import { runCli } from './bin.ts'

if (import.meta.main) {
  await runCli('akashx')
}
