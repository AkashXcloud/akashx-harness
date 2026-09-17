import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@akashx/cordis'
import { createUserMessage } from '@akashx/akx-llm'
import type { Agent } from '@akashx/akx-agent'
import { SessionId } from '@akashx/akx-session'
import { mountAgentLoopTestDependencies } from '@akashx/akx-agent-loop-testkit'
import AgentLoop from '@akashx/akx-agent-loop'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import CognateRuntime, { type CognateProvider } from '@akashx/akx-cognate'
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

/** A provider whose cognitive statement reports its spend the way ASK does: in the row. */
function spendingProvider(): CognateProvider {
  return {
    id: 'fixture',
    available: () => true,
    context: () => ({ dialect: 'starrocks', ragBuckets: ['docs'] }),
    execute: async request => ({
      sql: request.sql,
      kind: request.kind,
      columns: [{ name: 'Answer', type: 'VARCHAR' }],
      rows: [{
        Answer: '42',
        TotalInputTokens: 37_924,
        TotalOutputTokens: 5261,
        ModelUsed: 'gpt-5-nano',
        ModelProvider: 'foundry',
        RewriteMs: 431,
      }],
      citations: [],
      externalOperation: true,
    }),
  }
}

describe('deployment spend through the mounted composition', () => {
  it('totals a cognitive statement into the cognateUsage projection', async () => {
    const adapter = new MockAdapter([
      toolCallResponse('sql-1', 'run_sql', { sql: "ASK 'revenue' ON docs" }),
      textResponse('42.'),
    ])
    ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(CognateRuntime, { provider: 'fixture', allowExternalOperations: true })
    ctx.cognate.registerProvider(spendingProvider())
    await ctx.plugin(toolCognate)
    ctx.llm.registerAdapter(['mock'], adapter)
    agent = await ctx.agentLoop.create(SessionId('cognate-usage'), { provider: 'mock', model: 'mock' })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'ask' }], source: { kind: 'user' } }))
    await waitForIdle(ctx, agent)

    // Registration rides the tools' own fiber in the agent plane while the registry is the
    // host's; reading the service directly at apply() time raced its publication and
    // registered nothing at all, with no error. Assert the unit is actually driven.
    // run_sql must persist its result as tool/result meta; without that declaration the
    // fold below sees nothing and every deployment total silently reads zero.
    const ev = agent.session.snapshotEvents().find(e => e.type === 'tool/result')
    expect(ev?.type === 'tool/result' && ev.data.meta !== undefined).toBe(true)
    const totals = ctx.sessionProjections.stateOf(agent.session, 'cognateUsage')
    expect(totals).toBeDefined()
    expect(totals?.inputTokens).toBe(37_924)
    expect(totals?.outputTokens).toBe(5261)
    expect(totals?.calls).toBe(1)
    expect(totals?.stageMs).toBe(431)
    expect(totals?.routes).toEqual([
      { provider: 'foundry', model: 'gpt-5-nano', inputTokens: 37_924, outputTokens: 5261, calls: 1 },
    ])
  })
})
