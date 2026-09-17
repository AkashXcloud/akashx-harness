/** SQL classification and authorization for the Cognate service. */

import type { CognateQueryKind } from './types.ts'

const MUTATION = /^(CREATE|DROP|ALTER|TRUNCATE|INSERT|UPDATE|DELETE|REPLACE|MERGE|CALL|SET|USE|GRANT|REVOKE|REFRESH|REPLAY)\b/i
const METADATA = /^(SHOW|DESCRIBE|DESC|EXPLAIN)\b/i
const READ = /^(SELECT|WITH)\b/i
const COGNITIVE = /^(ASK|PROMPT)\b/i
const EXTERNAL_FUNCTION = /\b(?:cognitive_|excel_ai_)[a-z0-9_]*\s*\(/i

const SQL_FUNCTIONS = new Set([
  'array_agg', 'avg', 'cast', 'coalesce', 'concat', 'count', 'date', 'date_add', 'date_diff',
  'date_format', 'day', 'dense_rank', 'first_value', 'if', 'ifnull', 'json_extract', 'lag',
  'last_value', 'lead', 'lower', 'max', 'min', 'month', 'nullif', 'rank', 'regexp', 'round',
  'row_number', 'sum', 'substring', 'to_date', 'trim', 'upper', 'year', 'current_date',
  'current_timestamp', 'current_version', 'unix_timestamp',
  // Native StarRocks vector search: the approx_* forms are the only ones that
  // engage the HNSW index; the exact forms stay allowed for brute-force checks.
  'approx_cosine_similarity', 'cosine_similarity', 'approx_l2_distance', 'l2_distance',
  // JSON readers for ASK output and ontology provenance payloads.
  'get_json_string', 'get_json_int', 'get_json_double', 'json_query', 'json_length',
  // Plain scalars the ontology and chunk paths need.
  'abs', 'substr', 'left', 'right', 'locate', 'length', 'char_length', 'floor',
  'ceil', 'ceiling', 'greatest', 'least', 'mod', 'replace', 'split_part',
])

/** Keywords that may legally precede an open paren. `functionNames` matches any
 * identifier followed by `(`, so without this `AND (`, `IN (`, `OR (` and friends
 * were reported as unapproved functions and rejected valid SQL. */
const SQL_KEYWORDS = new Set([
  'and', 'or', 'not', 'in', 'exists', 'select', 'from', 'where', 'values', 'on', 'using',
  'when', 'then', 'else', 'case', 'by', 'over', 'partition', 'union', 'all', 'distinct',
  'as', 'between', 'like', 'is', 'null', 'having', 'group', 'order', 'limit', 'offset',
  'join', 'inner', 'outer', 'cross', 'full', 'with', 'set', 'interval', 'array', 'row',
])

/** Remove comments and quoted contents while preserving statement keywords.
 * @param sql - SQL text to redact for lexical policy checks.
 * @returns SQL with comments and quoted contents replaced by spaces.
 */
export function redactSqlForPolicy(sql: string): string {
  let output = ''
  let quote: string | undefined
  let lineComment = false
  let blockComment = false
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index] ?? ''
    const next = sql[index + 1]
    if (lineComment) {
      if (char === '\n') lineComment = false
      output += char === '\n' ? '\n' : ' '
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        output += '  '
        index += 1
      } else output += char === '\n' ? '\n' : ' '
      continue
    }
    if (quote !== undefined) {
      if (char === quote && sql[index - 1] !== '\\') quote = undefined
      output += ' '
      continue
    }
    if ((char === '-' && next === '-') || char === '#') {
      lineComment = true
      output += char === '#' ? ' ' : '  '
      if (char === '-') index += 1
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      output += '  '
      index += 1
      continue
    }
    if (char === '\'' || char === '"' || char === '`') {
      quote = char
      output += ' '
    } else output += char
  }
  return output
}

/** Count top-level statements after comments and quoted literals are ignored.
 * @param sql - SQL text to inspect.
 * @returns number of non-empty statements.
 */
export function statementCount(sql: string): number {
  const redacted = redactSqlForPolicy(sql)
  return redacted.split(';').filter(part => part.trim().length > 0).length
}

/** Classify one SQL statement without executing it.
 * @param sql - SQL text to classify.
 * @returns operation class selected by the leading statement or function family.
 */
export function classifySql(sql: string): CognateQueryKind {
  const normalized = redactSqlForPolicy(sql).trim()
  if (MUTATION.test(normalized)) return 'mutation'
  if (COGNITIVE.test(normalized) || EXTERNAL_FUNCTION.test(normalized)) return 'cognitive'
  if (METADATA.test(normalized)) return 'metadata'
  if (READ.test(normalized)) return 'read'
  return 'mutation'
}

function functionNames(sql: string): string[] {
  return [...redactSqlForPolicy(sql).matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/gi)]
    .map(match => match[1]?.toLowerCase())
    .filter((name): name is string => name !== undefined)
}

/** Cognitive operations a statement invokes: the leading `ASK`/`PROMPT` verb and every
 * `cognitive_*` / `excel_ai_*` call, lowercased. Used to gate one retrieval path per
 * session without also unlocking the others. */
export function cognitiveOperations(sql: string): string[] {
  const redacted = redactSqlForPolicy(sql)
  const ops = new Set<string>()
  const verb = /^(ASK|PROMPT)\b/i.exec(redacted)
  if (verb?.[1] !== undefined) ops.add(verb[1].toLowerCase())
  for (const match of redacted.matchAll(/\b((?:cognitive_|excel_ai_)[a-z0-9_]*)\s*\(/gi)) {
    const name = match[1]
    if (name !== undefined) ops.add(name.toLowerCase())
  }
  return [...ops]
}

/** Reject statements that exceed the read-only Cognate policy.
 * @param sql - SQL text to authorize.
 * @param kind - classification produced by {@link classifySql}.
 * @param allowExternalOperations - whether cognitive SQL may invoke external services.
 * @param allowedOperations - when set, the only cognitive operations this session may
 * invoke (see {@link cognitiveOperations}). Omitted means every operation is permitted
 * once `allowExternalOperations` is set.
 * @param deniedIdentifiers - substrings no statement may reference, matched against the
 * comment- and literal-stripped SQL. Gates the read paths that {@link classifySql} cannot
 * tell apart, so a session limited to one corpus cannot read another.
 */
export function authorizeSql(
  sql: string,
  kind: CognateQueryKind,
  allowExternalOperations: boolean,
  allowedOperations?: readonly string[],
  deniedIdentifiers?: readonly string[],
): void {
  if (statementCount(sql) !== 1) throw new Error('Cognate SQL must contain exactly one statement')
  if (kind === 'mutation') throw new Error('Cognate SQL permits only metadata and read operations')
  if (kind === 'cognitive' && !allowExternalOperations) {
    throw new Error('Cognate external SQL operations are disabled by policy')
  }
  if (kind === 'cognitive' && allowedOperations !== undefined) {
    const permitted = new Set(allowedOperations.map(name => name.toLowerCase()))
    const refused = cognitiveOperations(sql).find(name => !permitted.has(name))
    if (refused !== undefined) {
      throw new Error(`Cognate operation "${refused}" is not enabled for this session`)
    }
  }
  if (kind === 'read') {
    const unknown = functionNames(sql).find(name =>
      !SQL_KEYWORDS.has(name) && !SQL_FUNCTIONS.has(name) && !name.startsWith('count'))
    if (unknown !== undefined) throw new Error(`Cognate SQL function "${unknown}" is not approved`)
  }
  if (deniedIdentifiers !== undefined) {
    const redacted = redactSqlForPolicy(sql).toLowerCase()
    const denied = deniedIdentifiers.find(name => redacted.includes(name.toLowerCase()))
    if (denied !== undefined) {
      throw new Error(`Cognate source "${denied}" is not enabled for this session`)
    }
  }
}
