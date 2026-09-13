import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalMarkdownCognateProvider } from '../src/index.ts'

let root: string | undefined

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('LocalMarkdownCognateProvider', () => {
  it('retrieves heading-scoped Markdown sections with citations', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-cognate-local-'))
    await writeFile(join(root, 'policy.md'), '# Policy\n\nRevenue is recognized on delivery.\n\n## Scope\n\nThe policy covers invoices.')
    const provider = new LocalMarkdownCognateProvider({ knowledgeDir: root, bucket: 'docs' })
    const result = await provider.execute({ sql: "ASK 'revenue delivery' ON docs", kind: 'cognitive', signal: new AbortController().signal })
    expect(result.answer).toContain('Revenue is recognized on delivery')
    expect(result.citations[0]).toMatchObject({ document: 'policy.md' })
    expect(result.rows[0]).toMatchObject({ citation: 'policy.md > Policy' })
  })

  it('stays unavailable without a configured directory and rejects another bucket', async () => {
    const provider = new LocalMarkdownCognateProvider({})
    expect(provider.available()).toBe(false)
    await expect(provider.execute({ sql: "ASK 'x' ON other", kind: 'cognitive', signal: new AbortController().signal })).rejects.toThrow('only ASK')
  })
})
