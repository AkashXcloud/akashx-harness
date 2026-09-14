#!/usr/bin/env node
/**
 * Executable entry for the DeepSeek-compatible launcher.
 * @module @deepseek-ai/dsh/bin-entry
 */

import { runCli } from './bin.ts'

if (import.meta.main) {
  await runCli()
}
