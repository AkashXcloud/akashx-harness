import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import CognateRuntime from '@deepseek-ai/dsh-cognate'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as toolCognate from '@deepseek-ai/dsh-tool-cognate'
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
    root = await mkdtemp(join(tmpdir(), 'dsh-cognate-local-loader-'))
    await writeFile(join(root, 'policy.md'), '# Policy\n\nRevenue is recognized on delivery.')
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-system-prompt'",
      "- name: '@deepseek-ai/dsh-tools'",
      "- name: '@deepseek-ai/dsh-cognate'",
      '  config:',
      '    provider: local-markdown',
      '    allowExternalOperations: true',
      "- name: '@deepseek-ai/dsh-cognate-local'",
      '  config:',
      `    knowledgeDir: ${JSON.stringify(root)}`,
      '    bucket: docs',
      '    maxResults: 1',
      "- name: '@deepseek-ai/dsh-tool-cognate'",
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
          ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
          ['@deepseek-ai/dsh-tools', ToolRuntime],
          ['@deepseek-ai/dsh-cognate', CognateRuntime],
          ['@deepseek-ai/dsh-cognate-local', localCognate],
          ['@deepseek-ai/dsh-tool-cognate', toolCognate],
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
