---
description: "面向 AkashXDB 的 Cognate Harness Agent 能力类型和运行时契约。"
kind: "subsystem-reference"
---

# Cognate 子系统

[English](cognate.md) | 中文

## 摘要

Cognate 能力将 AkashXDB 执行加入原生 Harness Agent 循环。`akx-cognate` 选择 Provider 并执行 SQL 策略；`akx-cognate-mysql` 提供直接 MySQL 协议执行；`akx-cognate-local` 为离线开发和测试保留确定性的 Markdown 检索；`akx-tool-cognate` 提供 `run_sql`、语义上下文和确定性图表元数据。现有 Bash、文件系统、Web、Session、Skill、Workflow、Subagent 和 MCP 工具仍是独立能力。

## 查询策略

服务将语句分类为元数据、普通读取、认知/外部操作和变更语句。它只允许单条语句，限制 SQL 和序列化行，拒绝变更及管理语句，并在未显式配置 `allowExternalOperations` 时拒绝认知操作。`ASK`、`PROMPT`、`cognitive_*` 和 `excel_ai_*` 属于外部操作，因为 AkashXDB 函数可能调用服务、Worker、存储、Redis 或 LLM。

## 来源选择

模型接收包含表、Ontology View、RagBucket、指标和当前方言的有界 Provider 上下文。普通表和已完成的 Ontology View 行使用 SQL；RagBucket 使用 `ASK`；定向文档概念树查询使用获准的认知 SQL。本地 Markdown Provider 仅用于离线开发和测试，不是生产事实来源。

## 结果和图表

`run_sql` 返回标准化列、JSON 行、操作类别、截断状态、可选答案和引用。`render_chart` 验证已有结果、图表类型、列、数值序列和点数；它没有 Provider 依赖，也不能执行 SQL。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcognate--cognateruntime"></a>

### `ctx.cognate` — `CognateRuntime`

Provider registry and bounded AkashXDB execution service.

```ts cordis-catalog
/** Register one transport provider and return its lifecycle disposer.
 * @param provider - provider to add to the runtime registry.
 * @returns disposer that removes the provider.
 */
registerProvider(provider: CognateProvider): () => void

/** Return the bounded context currently supplied by the selected provider.
 * @returns provider-supplied semantic context, when available.
 */
context(): CognateSemanticContext | undefined

/**
 * Describe the selected provider state for model-facing prompt context.
 * @returns provider id, readiness, and an actionable unavailable reason.
 */
availability(): { provider: string | undefined; available: boolean; reason?: string }

/** Classify, authorize, execute, and bound one model-submitted SQL call.
 * @param request - SQL text and caller cancellation signal.
 * @returns normalized and bounded query result.
 */
async execute(request: { readonly sql: string; readonly signal: AbortSignal }): Promise<CognateQueryResult>

/** Run host-owned deployment capability checks through the selected provider.
 * @param probes - named, read-policy-checked SQL statements to execute.
 * @param signal - cancellation signal for the whole probe operation.
 * @returns support result for every requested capability.
 */
async probe(probes: readonly CognateCapabilityProbe[], signal: AbortSignal): Promise<readonly CognateProbeResult[]>
```

Source: [`packages/cognate/cognate/src/index.ts`](../../packages/cognate/cognate/src/index.ts)
<!-- END GENERATED cordis-surface -->

## 生命周期和传输

Provider 注册由 effect 管理，并随组合销毁。直接 MySQL Provider 在取消时销毁当前连接，并等待驱动完成。凭据只存在于 Provider 配置，不会进入提示词上下文、工具输出或图表元数据。Superset/SSE 兼容和实时元数据发现属于独立适配器。
