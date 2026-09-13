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

/** Reject statements that exceed the read-only Cognate policy.
 * @param sql - SQL text to authorize.
 * @param kind - classification produced by {@link classifySql}.
 * @param allowExternalOperations - whether cognitive SQL may invoke external services.
 */
export function authorizeSql(sql: string, kind: CognateQueryKind, allowExternalOperations: boolean): void {
  if (statementCount(sql) !== 1) throw new Error('Cognate SQL must contain exactly one statement')
  if (kind === 'mutation') throw new Error('Cognate SQL permits only metadata and read operations')
  if (kind === 'cognitive' && !allowExternalOperations) {
    throw new Error('Cognate external SQL operations are disabled by policy')
  }
  if (kind === 'read') {
    const unknown = functionNames(sql).find(name => !SQL_FUNCTIONS.has(name) && !name.startsWith('count'))
    if (unknown !== undefined) throw new Error(`Cognate SQL function "${unknown}" is not approved`)
  }
}
