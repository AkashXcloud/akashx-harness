/**
 * Grading a question's lane answers against a known-good answer.
 *
 * The judge runs as its own Session, never inside a lane. Two reasons, and the
 * second is the one that matters: judging spends tokens, and a lane's spend is
 * the figure the panel exists to compare, so grading inside a lane would corrupt
 * the measurement at the moment it is read. And a lane knows only its own
 * answer -- judging is a comparison, so it needs all of them, which only the
 * panel has.
 *
 * Answers are graded blind. The lane each answer came from is replaced by a
 * letter and the order is shuffled, so the grader cannot prefer a mode it has
 * been told is the interesting one; the labels are restored afterwards.
 *
 * The grader also picks which benchmark question was asked. The whole answer
 * key goes into the prompt and it reads for what is being asked rather than for
 * matching words, because nobody asks a question in the benchmark's exact
 * wording and a lane's answer is not phrased like the benchmark's either. It
 * reports the row it matched, so a grade always says what it was measured
 * against.
 *
 * @module @akashx/akx-client-ui-bridge/judge
 */

import type { BenchAnswer } from '../bridge-settings.ts'

/** One answer submitted for grading, and where it came from. */
export interface JudgeEntry {
  /** The lane key, restored onto the verdict after grading. */
  readonly key: string
  readonly answer: string
}

/** What the grader read back: the row it matched, and its ruling per lane. */
export interface JudgeResult {
  /** The answer-key row the grader graded against, absent when it matched none. */
  readonly matched?: BenchAnswer
  readonly verdicts: readonly JudgeVerdict[]
}

/** What the grader concluded about one lane. */
export interface JudgeVerdict {
  readonly key: string
  readonly correct: boolean
  /** The grader's stated reason, when it gave one. */
  readonly reason?: string
}

/** Letters assigned to shuffled answers; a run wider than this is not graded. */
const LETTERS = 'ABCDEFGHIJ'

/**
 * Deal answers to letters in a shuffled order.
 *
 * @param entries - the answers to grade.
 * @param random - source of randomness, injected so a test can fix the order.
 * @returns the letter each lane was dealt, in presentation order.
 */
export function dealBlind(
  entries: readonly JudgeEntry[],
  random: () => number = Math.random,
): { letter: string; entry: JudgeEntry }[] {
  const shuffled = [...entries]
  for (let at = shuffled.length - 1; at > 0; at -= 1) {
    const swap = Math.floor(random() * (at + 1))
    const held = shuffled[at] as JudgeEntry
    shuffled[at] = shuffled[swap] as JudgeEntry
    shuffled[swap] = held
  }
  return shuffled.slice(0, LETTERS.length)
    .map((entry, at) => ({ letter: LETTERS[at] as string, entry }))
}

/** Row index the grader answers with, for a key whose rows carry no id. */
export const rowId = (key: readonly BenchAnswer[], at: number): string =>
  key[at]?.id ?? `row-${at + 1}`

/**
 * Build the grading prompt.
 *
 * The grader is told to read only what it is given. It runs in an ordinary
 * Session that can reach the deployment, and a grader that decided to look the
 * answer up itself would be grading its own retrieval rather than the answers
 * in front of it.
 *
 * The whole answer key goes in, and matching the question to a row is the
 * grader's first job. String matching cannot do it: a person asks in their own
 * words, wraps the question in retrieval instructions, or asks for the same
 * figure a different way, and a key lookup that missed would put the typing
 * back in front of them. Reading for what is being asked is the one part of
 * this that needs a model.
 *
 * @param question - the question every lane was asked.
 * @param key - the rows to match against; a typed answer arrives as the only row.
 * @param dealt - answers under their blind letters.
 * @returns the prompt text.
 */
export function judgePrompt(
  question: string,
  key: readonly BenchAnswer[],
  dealt: readonly { letter: string; entry: JudgeEntry }[],
): string {
  const answers = dealt.map(({ letter, entry }) => `${letter}. ${entry.answer}`).join('\n\n')
  const rows = key.map((row, at) => `${rowId(key, at)} | ${row.question} | ${row.gold}`).join('\n')
  return [
    'Grade each answer below. Use ONLY the text in this message: do not run any query,',
    'read any file, or use any tool.',
    '',
    'THE LANES WERE ASKED:',
    question,
    '',
    'ANSWER KEY, one row per question, as `id | question | correct answer`:',
    rows,
    '',
    'First find the row asking the same question the lanes were asked. The wording will',
    'differ and the asked question may carry extra retrieval instructions; match on what is',
    'being asked -- the company, the figure, the period -- not on shared words. If no row',
    'asks that question, reply exactly `Q=none` and nothing else.',
    '',
    'ANSWERS:',
    answers,
    '',
    'An answer is correct when it states the same figure with the same unit and period as that',
    "row's correct answer. Wording, formatting, rounding of trailing zeros, and extra commentary",
    'do not matter. A different figure, unit or period is incorrect, as is refusing to answer.',
    '',
    // The verdict is read back from the turn's response preview, which the host
    // clips to 120 characters. A reply that spent a line per answer would lose
    // its last verdicts to that clip, so the whole grade has to fit one short
    // line: the matched id, one token per answer, and reasons kept to a couple
    // of words.
    "Reply with ONE short line and nothing else: the matched row's id as `Q=<id>`, then one",
    'token per answer, space separated, either `A=correct` or `A=wrong:reason`, where reason',
    'is at most two words.',
    'Example: Q=financebench_id_03029 A=correct B=wrong:says-1540 C=correct',
  ].join('\n')
}

/**
 * Read the grader's reply back into the row it matched and its verdicts.
 *
 * A letter the grader did not rule on yields no verdict rather than a guess: an
 * ungraded answer must not read as a failed one. A reply naming no row yields
 * no verdicts at all, because every ruling in it was measured against an answer
 * the panel cannot name.
 *
 * @param reply - the grader's message text.
 * @param key - the rows the prompt offered, for resolving the matched id.
 * @param dealt - the deal used to build the prompt.
 * @returns the matched row and one verdict per letter the grader ruled on.
 */
export function readGrade(
  reply: string,
  key: readonly BenchAnswer[],
  dealt: readonly { letter: string; entry: JudgeEntry }[],
): JudgeResult {
  const named = /\bQ\s*[=:]\s*([A-Za-z0-9_-]+)/.exec(reply)?.[1]
  const at = named === undefined ? -1 : key.findIndex((_, index) => rowId(key, index) === named)
  if (at < 0) return { verdicts: [] }
  return { matched: key[at] as BenchAnswer, verdicts: readVerdicts(reply, dealt) }
}

/**
 * Read one ruling per letter out of the grader's reply.
 *
 * @param reply - the grader's message text.
 * @param dealt - the deal used to build the prompt.
 * @returns one verdict per letter the grader ruled on.
 */
export function readVerdicts(
  reply: string,
  dealt: readonly { letter: string; entry: JudgeEntry }[],
): JudgeVerdict[] {
  const verdicts: JudgeVerdict[] = []
  for (const { letter, entry } of dealt) {
    // `A=correct`, `A=wrong:says-1540`, and the decoration a model adds around them.
    const match = new RegExp(`\\b${letter}\\s*[=:]\\s*(correct|wrong|incorrect)(?::([^\\s,;]+))?`, 'i')
      .exec(reply)
    if (match === null) continue
    const correct = (match[1] ?? '').toLowerCase() === 'correct'
    const reason = match[2]?.replace(/[-_]+/g, ' ').trim()
    verdicts.push({
      key: entry.key,
      correct,
      ...correct || reason === undefined || reason === '' ? {} : { reason },
    })
  }
  return verdicts
}
