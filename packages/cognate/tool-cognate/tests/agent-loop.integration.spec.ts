import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import CognateRuntime, { type CognateProvider } from '@deepseek-ai/dsh-cognate'
import * as toolCognate from '../src/index.ts'

let ctx: Context | undefined
let agent: Agent | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  agent = undefined
  ctx = undefined
})

function provider(): CognateProvider {
  return {
    id: 'fixture',
    available: () => true,
    context: () => ({ dialect: 'starrocks', tables: ['sales'], ragBuckets: ['docs'] }),
    execute: async request => ({
      sql: request.sql,
      kind: request.kind,
      columns: [{ name: 'revenue', type: 'DOUBLE' }],
      rows: [{ revenue: 42 }],
      citations: [{ document: 'sales-ledger', page: 2 }],
      externalOperation: false,
    }),
  }
}

function waitForIdle(context: Context, subject: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = context.on('agent/status', ({ agent: current, status }) => {
      if (current === subject && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}

describe('run_sql in the native Harness agent loop', () => {
  it('records a replayable tool lifecycle and feeds normalized citations into the next model request', async () => {
    const adapter = new MockAdapter([
      toolCallResponse('sql-1', 'run_sql', { sql: 'SELECT revenue FROM sales' }),
      textResponse('Revenue is 42 with a ledger citation.'),
    ])
    ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(CognateRuntime, { provider: 'fixture' })
    ctx.cognate.registerProvider(provider())
    await ctx.plugin(toolCognate)
    ctx.llm.registerAdapter(['mock'], adapter)
    agent = await ctx.agentLoop.create(SessionId('cognate-loop'), { provider: 'mock', model: 'mock' })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'query revenue' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    const events = agent.session.snapshotEvents()
    const call = events.find(event => event.type === 'tool/call')
    const result = events.find(event => event.type === 'tool/result')
    expect(call?.type === 'tool/call' && call.data.name).toBe('run_sql')
    expect(result?.type).toBe('tool/result')
    if (result?.type === 'tool/result') {
      expect(result.data.message.content[0].isError).toBe(false)
      expect(JSON.stringify(result.data.message.content)).toContain('sales-ledger')
    }
    const secondRequest = adapter.requests[1]
    expect(secondRequest?.messages.some(message => message.content.some(block => block.type === 'tool-result'))).toBe(true)
    expect(JSON.stringify(secondRequest?.messages)).toContain('sales')
    const assistantMessages = events.filter(event => event.type === 'assistant/message')
    expect(assistantMessages.some(event => event.type === 'assistant/message' && event.data.usage !== undefined)).toBe(true)
  })
})
