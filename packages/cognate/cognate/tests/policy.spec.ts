import { describe, expect, it } from 'vitest'
import { authorizeSql, classifySql, statementCount } from '../src/index.ts'

describe('Cognate SQL policy', () => {
  it.each([
    ['SELECT * FROM sales', 'read'],
    ['SHOW ONTOLOGY VIEWS', 'metadata'],
    ["ASK 'What is revenue?' ON finance_docs", 'cognitive'],
    ['DROP TABLE sales', 'mutation'],
  ] as const)('classifies %s as %s', (sql, kind) => {
    expect(classifySql(sql)).toBe(kind)
  })

  it('ignores semicolons inside strings and comments', () => {
    expect(statementCount("SELECT 'a;b' AS value /* ; */")).toBe(1)
    expect(statementCount('SELECT 1; SELECT 2')).toBe(2)
  })

  it('rejects mutation, stacked, external, and unapproved function calls', () => {
    expect(() => { authorizeSql('DELETE FROM sales', 'mutation', true) }).toThrow('only metadata and read operations')
    expect(() => { authorizeSql('SELECT 1; SELECT 2', 'read', true) }).toThrow('exactly one statement')
    expect(() => { authorizeSql("ASK 'x' ON docs", 'cognitive', false) }).toThrow('external SQL operations are disabled')
    expect(() => { authorizeSql('SELECT custom_udf(value) FROM sales', 'read', true) }).toThrow('custom_udf')
  })

  it.each([
    'SELECT id FROM sales WHERE a = 1 AND (b = 2 OR c = 3)',
    'SELECT count(*) FROM sales WHERE id IN (1, 2, 3)',
    'SELECT id FROM sales WHERE NOT (archived)',
  ])('accepts keywords that precede an open paren: %s', (sql) => {
    expect(() => { authorizeSql(sql, 'read', false) }).not.toThrow()
  })

  it.each([
    'SELECT approx_cosine_similarity(vector, [0.1, 0.2]) AS score FROM chunks ORDER BY score DESC LIMIT 10',
    'SELECT cosine_similarity(vector, [0.1]) FROM chunks LIMIT 1',
    "SELECT get_json_string(result, '$.result.provenance.Revenue_P0') FROM fb_ov_income LIMIT 1",
    'SELECT ABS(Capital_Expenditures_P0) FROM fb_ov_cashflow LIMIT 1',
  ])('approves the read-path functions the retrieval modes need: %s', (sql) => {
    expect(() => { authorizeSql(sql, 'read', false) }).not.toThrow()
  })

  it('still rejects an unapproved function that merely looks like a keyword', () => {
    expect(() => { authorizeSql('SELECT ordered(value) FROM sales', 'read', true) }).toThrow('ordered')
  })
})
