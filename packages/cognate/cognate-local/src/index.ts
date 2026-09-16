/** Offline Markdown knowledge provider for Cognate development and tests. @module @akashx/akx-cognate-local */

import { Context } from '@akashx/cordis'
import z from '@akashx/schemastery'
import type { CognateProvider, CognateQueryRequest, CognateQueryResult, CognateSemanticContext } from '@akashx/akx-cognate'
import type {} from '@akashx/akx-cognate'
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Offline provider configuration. */
export interface Config {
  /** Directory containing Markdown knowledge documents. */
  readonly knowledgeDir?: string
  /** RagBucket name accepted by offline ASK statements. */
  readonly bucket?: string
  /** Maximum cited Markdown sections returned for one question. */
  readonly maxResults?: number
}

export const Config: z<Config> = z.object({
  knowledgeDir: z.string(),
  bucket: z.string().default('local_docs'),
  maxResults: z.number().default(5),
})

/** Cordis plugin name. */
export const name = 'cognate-local'

/** The provider registers into the Cognate service. */
export const inject = ['cognate']

interface Section {
  readonly document: string
  readonly citation: string
  readonly text: string
}

/** Deterministic Markdown provider for offline knowledge retrieval. */
export class LocalMarkdownCognateProvider implements CognateProvider {
  readonly id = 'local-markdown'
  private readonly bucket: string
  private readonly maxResults: number

  constructor(private readonly config: Config) {
    this.bucket = config.bucket ?? 'local_docs'
    this.maxResults = config.maxResults ?? 5
    if (!Number.isSafeInteger(this.maxResults) || this.maxResults < 1) throw new Error('cognate-local: maxResults must be a positive safe integer')
  }

  available(): boolean {
    return this.config.knowledgeDir !== undefined && existsSync(this.config.knowledgeDir)
  }

  context(): CognateSemanticContext {
    return { ragBuckets: [this.bucket], instructions: ['Offline Markdown retrieval is for development and tests; production knowledge uses AkashXDB.'] }
  }

  async execute(request: CognateQueryRequest): Promise<CognateQueryResult> {
    request.signal.throwIfAborted()
    const question = parseAsk(request.sql, this.bucket)
    if (question === undefined) throw new Error(`cognate-local: only ASK '<question>' ON ${this.bucket} is supported`)
    const sections = await loadSections(this.config.knowledgeDir as string, request.signal)
    const hits = rankSections(sections, question).slice(0, this.maxResults)
    const citations = hits.map(hit => ({ document: hit.section.document, text: hit.section.text }))
    return {
      sql: request.sql,
      kind: request.kind,
      columns: [{ name: 'document', type: 'VARCHAR' }, { name: 'citation', type: 'VARCHAR' }, { name: 'text', type: 'VARCHAR' }, { name: 'score', type: 'DOUBLE' }],
      rows: hits.map(hit => ({ document: hit.section.document, citation: hit.section.citation, text: hit.section.text, score: hit.score })),
      answer: hits.length === 0 ? 'No relevant offline knowledge was found.' : hits.map(hit => hit.section.text).join('\n\n'),
      citations,
      externalOperation: true,
    }
  }
}

/** Register the configured offline provider in the host Cognate service. */
export function apply(ctx: Context, config: Config): void {
  ctx.cognate.registerProvider(new LocalMarkdownCognateProvider(config))
}

function parseAsk(sql: string, bucket: string): string | undefined {
  const match = /^\s*ASK\s+'((?:''|\\.|[^'\\])*)'\s+ON\s+([\w.-]+)\s*;?\s*$/i.exec(sql)
  if (match === null || match[2]?.toLowerCase() !== bucket.toLowerCase()) return undefined
  return (match[1] ?? '').replaceAll("''", "'").replaceAll("\\'", "'").trim()
}

async function loadSections(directory: string, signal: AbortSignal): Promise<Section[]> {
  const files = await markdownFiles(directory, signal)
  const sections: Section[] = []
  for (const file of files) {
    signal.throwIfAborted()
    const text = await readFile(file, 'utf8')
    sections.push(...splitSections(relative(directory, file), text))
  }
  return sections
}

async function markdownFiles(directory: string, signal: AbortSignal): Promise<string[]> {
  signal.throwIfAborted()
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    signal.throwIfAborted()
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await markdownFiles(path, signal))
    else if (entry.isFile() && /\.(?:md|markdown)$/i.test(entry.name)) files.push(path)
  }
  return files
}

function splitSections(document: string, text: string): Section[] {
  const lines = text.split(/\r?\n/)
  const sections: Section[] = []
  let heading = document
  let body: string[] = []
  const flush = (): void => {
    const value = body.join('\n').trim()
    if (value.length > 0) sections.push({ document, citation: heading, text: value.slice(0, 4000) })
    body = []
  }
  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (match !== null) {
      flush()
      heading = `${document} > ${match[2]}`
    } else body.push(line)
  }
  flush()
  return sections
}

function rankSections(sections: readonly Section[], question: string): { section: Section; score: number }[] {
  const terms = [...new Set(question.toLowerCase().split(/[^a-z0-9_]+/).filter(term => term.length > 1))]
  return sections.map((section) => {
    const haystack = `${section.citation} ${section.text}`.toLowerCase()
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
    return { section, score }
  }).filter(hit => hit.score > 0).sort((left, right) => right.score - left.score
    || left.section.citation.localeCompare(right.section.citation))
}
