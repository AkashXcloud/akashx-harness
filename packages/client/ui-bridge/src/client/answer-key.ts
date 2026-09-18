/**
 * Matching a question the lanes were asked against the benchmark's answer key.
 *
 * The panel knows what it sent, so nobody should have to retype it to grade it.
 * What it does not know is which correct answer belongs to it, and that is the
 * one fact the key supplies.
 *
 * @module @akashx/akx-client-ui-bridge/answer-key
 */

import type { BenchAnswer } from '../bridge-settings.ts'

/**
 * Reduce a question to what two copies of it always share.
 *
 * Case, punctuation and run-together whitespace all vary between a benchmark
 * file and what reaches a composer -- a paste picks up a newline, an editor
 * turns an apostrophe into a curly one -- and none of them change which
 * question was asked.
 *
 * @param text - the question as written.
 * @returns lowercase words joined by single spaces.
 */
export function normalizeQuestion(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9.%$]+/g, ' ').trim()
}

/**
 * Find the correct answer for a question the lanes were asked.
 *
 * A stored question contained in what was asked counts as the same question, so
 * a prompt that wraps the benchmark text in an instruction still resolves. The
 * containment runs one way only: a short asked question must not claim a longer
 * stored one it merely appears inside. Nothing fuzzier is attempted -- a near
 * miss graded against the wrong answer is worse than no grade at all.
 *
 * @param key - the deployment's answer key.
 * @param question - what the lanes were asked.
 * @returns the known-good answer, or undefined when the key does not cover it.
 */
export function lookupGold(key: readonly BenchAnswer[], question: string): string | undefined {
  const asked = normalizeQuestion(question)
  if (asked === '') return undefined
  let best: BenchAnswer | undefined
  for (const entry of key) {
    const stored = normalizeQuestion(entry.question)
    if (stored === '') continue
    if (stored === asked) return entry.gold
    // The longest contained question wins: two benchmark questions about the
    // same filing can share a prefix, and the more specific one is the match.
    if (asked.includes(stored) && (best === undefined || stored.length > normalizeQuestion(best.question).length)) {
      best = entry
    }
  }
  return best?.gold
}
