import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@akashx/cordis'
import Include from '@akashx/cordis-plugin-include'
import Loader from '@akashx/cordis-plugin-loader'
import { ToolCallId } from '@akashx/akx-llm'
import CognateRuntime from '@akashx/akx-cognate'
import SystemPrompt from '@akashx/akx-system-prompt'
import ToolRuntime from '@akashx/akx-tools'
import * as toolCognate from '@akashx/akx-tool-cognate'
import * as localCognate from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('cognate-local through a real Loader composition', () => {
  it('feeds offline cited knowledge through the model-facing run_sql tool', async () => {
    root = await mkdtemp(join(tmpdir(), 'akx-cognate-local-loader-'))
    await writeFile(join(root, 'policy.md'), '# Policy\n\nRevenue is recognized on delivery.')
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@akashx/akx-system-prompt'",
      "- name: '@akashx/akx-tools'",
      "- name: '@akashx/akx-cognate'",
      '  config:',
      '    provider: local-markdown',
      '    allowExternalOperations: true',
      "- name: '@akashx/akx-cognate-local'",
      '  config:',
      `    knowledgeDir: ${JSON.stringify(root)}`,
      '    bucket: docs',
      '    maxResults: 1',
      "- name: '@akashx/akx-tool-cognate'",
      '',
    ].join('\n'))

    const ctx = new Context()
    context = ctx
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        const modules = new Map<string, unknown>([
          ['@akashx/akx-system-prompt', SystemPrompt],
          ['@akashx/akx-tools', ToolRuntime],
          ['@akashx/akx-cognate', CognateRuntime],
          ['@akashx/akx-cognate-local', localCognate],
          ['@akashx/akx-tool-cognate', toolCognate],
        ])
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()

    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('local-loader-knowledge'),
      name: 'run_sql',
      arguments: { sql: "ASK 'revenue delivery' ON docs" },
    })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({
      kind: 'cognitive',
      citations: [{ document: 'policy.md' }],
    })
    expect(result.content).toContainEqual({
      type: 'text',
      text: expect.stringContaining('Revenue is recognized on delivery.') as unknown,
    })
  })
})
