/**
 * Lifting `cognitive_embed(...)` out of a retrieval statement and back in as a literal.
 *
 * Native vector search only reaches the HNSW index when the query vector is an array
 * literal; a scalar subquery or a session variable makes the planner scan every row
 * instead. But a literal is hundreds of floats, and a model asked to copy them from one
 * tool result into the next statement drops elements -- observed losing 1 of 768, then
 * 696 of 768, each time refused as a dimension mismatch.
 *
 * The statement therefore names the embedding it wants and the provider supplies the
 * digits: each call is evaluated once, then spliced back as the literal the index needs.
 * Authorization still reads the statement the model wrote, so a session that may not call
 * `cognitive_embed` is refused before any of this runs.
 *
 * @module @akashx/akx-cognate/embed-hoist
 */

import { redactSqlForPolicy } from './policy.ts'

/** One `cognitive_embed(...)` call and the exact span it occupies in the statement. */
export interface EmbedCall {
  /** The call source, evaluated as `SELECT <expression>` to obtain its vector. */
  readonly expression: string
  readonly start: number
  /** Exclusive end offset. */
  readonly end: number
}

/**
 * Whether a statement's embedding calls should be hoisted at all.
 *
 * A statement with no `FROM` is the model asking for a vector as the answer, and
 * rewriting it to the literal it just produced would be pure cost. Only a statement that
 * reads a table can be the retrieval this exists to make index-eligible.
 * @param sql - the statement as submitted.
 * @returns whether hoisting applies.
 */
export function shouldHoistEmbeddings(sql: string): boolean {
  return /\bFROM\b/i.test(redactSqlForPolicy(sql))
}

/**
 * Locate every `cognitive_embed(...)` call in a statement.
 *
 * Spans are found against the comment- and literal-stripped statement, so a call named
 * inside a quoted string or a comment is not mistaken for one to evaluate, and a
 * parenthesis inside a string argument cannot unbalance the scan.
 * @param sql - the statement to inspect.
 * @returns each call in source order.
 */
export function findEmbedCalls(sql: string): EmbedCall[] {
  const redacted = redactSqlForPolicy(sql)
  const calls: EmbedCall[] = []
  for (const match of redacted.matchAll(/\bcognitive_embed\s*\(/gi)) {
    const start = match.index
    let depth = 0
    let end = -1
    for (let at = start + match[0].length - 1; at < redacted.length; at += 1) {
      const char = redacted[at]
      if (char === '(') depth += 1
      else if (char === ')') {
        depth -= 1
        if (depth === 0) { end = at + 1; break }
      }
    }
    // An unbalanced call is malformed SQL; leave it for the deployment to reject verbatim.
    if (end !== -1) calls.push({ expression: sql.slice(start, end), start, end })
  }
  return calls
}

/**
 * Replace each located call with its vector, written as an array literal.
 *
 * @param sql - the statement the calls were located in.
 * @param calls - calls in source order, as returned by {@link findEmbedCalls}.
 * @param vectors - one vector per call, in the same order.
 * @returns the statement with every call replaced by its literal.
 * @throws when the counts differ, which would silently pair a vector with the wrong call.
 */
export function spliceEmbeddings(
  sql: string,
  calls: readonly EmbedCall[],
  vectors: readonly (readonly number[])[],
): string {
  if (calls.length !== vectors.length) {
    throw new Error(`Cognate embedding hoist expected ${calls.length} vectors, received ${vectors.length}`)
  }
  let output = ''
  let cursor = 0
  for (const [index, call] of calls.entries()) {
    const vector = vectors[index] ?? []
    output += sql.slice(cursor, call.start) + `[${vector.join(',')}]`
    cursor = call.end
  }
  return output + sql.slice(cursor)
}

/**
 * Read one embedding vector out of a provider result row.
 *
 * The column is named after the whole call expression, so the value is taken positionally.
 * @param row - the single row returned by evaluating one call.
 * @returns the vector, or undefined when the row carried no numeric array.
 */
export function vectorFromRow(row: Record<string, unknown> | undefined): number[] | undefined {
  if (row === undefined) return undefined
  const value = Object.values(row)[0]
  const array = typeof value === 'string' ? parseVectorText(value) : value
  if (!Array.isArray(array)) return undefined
  const vector = array.map(entry => typeof entry === 'number' ? entry : Number(entry))
  return vector.every(entry => Number.isFinite(entry)) ? vector : undefined
}

/** Parse the bracketed float list a deployment may return as text rather than an array. */
function parseVectorText(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return undefined
  const body = trimmed.slice(1, -1).trim()
  return body === '' ? [] : body.split(',')
}
