#!/usr/bin/env node
/** Private entry owned by the Python single-file runtime packaging. */

const selectorName = 'AKX_SUBPROCESS_RUNNER'
const selection = process.env[selectorName]

if (selection === undefined) {
  const { runCli } = await import('@akashx/akx/lib/bin.js')
  await runCli()
} else {
  Reflect.deleteProperty(process.env, selectorName)
  const { runSelectedSubprocessRunner } = await import('@akashx/akx-subprocess-local/runner')
  await runSelectedSubprocessRunner(selection)
}
