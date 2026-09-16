import { describe, expect, it } from 'vitest'
import {
  AkashXSearchProvider,
  AKASHX_DEFAULT_API_VERSION,
  AKASHX_DEFAULT_BASE_URL,
  AKASHX_DEFAULT_MAX_TOKENS,
  AKASHX_DEFAULT_MAX_USES,
  AKASHX_DEFAULT_MODEL,
} from '@akashx/akx-web-search-akx'

/** Construct the provider over a fixed options value; production passes a live thunk. */
import type { AkashXSearchProviderOptions } from '@akashx/akx-web-search-akx'

const searchProvider = (options: AkashXSearchProviderOptions): AkashXSearchProvider =>
  new AkashXSearchProvider(() => options)

/**
 * Disabled real-API probe for the AkashX search provider. The live endpoint
 * can complete without structured source blocks, so this is not a reliable
 * merge signal. Its body remains because mocks cannot confirm the wire shape.
 */
const apiKey = process.env.AKASHX_API_KEY
const maybe = apiKey !== undefined && apiKey.length > 0 ? describe : describe.skip

maybe('AkashXSearchProvider real API', () => {
  it.skip('returns citeable sources for a live query via native web_search', async () => {
    const provider = searchProvider({
      apiKey: apiKey!,
      baseURL: process.env.AKASHX_SEARCH_BASE_URL ?? AKASHX_DEFAULT_BASE_URL,
      model: process.env.AKASHX_SEARCH_MODEL ?? AKASHX_DEFAULT_MODEL,
      apiVersion: AKASHX_DEFAULT_API_VERSION,
      maxTokens: AKASHX_DEFAULT_MAX_TOKENS,
      maxUses: AKASHX_DEFAULT_MAX_USES,
    })
    const result = await provider.search({ query: 'What is AkashX Harness?', maxResults: 5 })
    expect(result.sources.length).toBeGreaterThan(0)
    for (const source of result.sources) expect(source.url).toMatch(/^https?:\/\//)
  }, 60_000)
})
