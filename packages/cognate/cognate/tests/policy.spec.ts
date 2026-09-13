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
})
