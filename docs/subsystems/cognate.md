---
description: "Cognate capability types and runtime contracts for AkashXDB-backed Harness agents."
kind: "subsystem-reference"
---

# Cognate subsystem

English | [中文](cognate.zh.md)

## Summary

The Cognate capability adds AkashXDB execution to the native Harness agent loop. `dsh-cognate` selects a provider and enforces SQL policy; `dsh-cognate-mysql` supplies direct MySQL-wire execution; `dsh-cognate-local` retains deterministic Markdown retrieval for offline development and tests; `dsh-tool-cognate` contributes `run_sql`, semantic context, and deterministic chart metadata. Existing Bash, filesystem, web, session, skill, workflow, subagent, and MCP tools remain independent capabilities.

## Query policy

The service classifies metadata statements, ordinary reads, cognitive/external operations, and mutation statements. It permits only one statement, bounds SQL and serialized rows, denies mutation/admin statements, and denies cognitive operations unless `allowExternalOperations` is explicit. `ASK`, `PROMPT`, `cognitive_*`, and `excel_ai_*` are external because AkashXDB functions can invoke services, workers, storage, Redis, or LLM providers.

## Source selection

The model receives bounded provider context describing tables, Ontology Views, RagBuckets, metrics, and the active dialect. Ordinary tables and completed Ontology View rows use SQL. RagBuckets use `ASK`; targeted document concept-tree calls use approved cognitive SQL. The local Markdown provider is an offline test and development substitute only, not a production source of truth.

## Result and chart contracts

`run_sql` returns normalized columns, JSON rows, operation class, truncation, optional answer, and citations. `render_chart` validates an existing result, supported chart type, columns, numeric series, and point count. It has no provider dependency and cannot execute SQL.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

## Capability probing, lifecycle, and transport

Host code can submit named `SELECT`, metadata, or explicitly enabled cognitive statements to `ctx.cognate.probe()`. The service applies the same policy before delegating; required unsupported probes fail, and optional probes return support flags. Provider registration is effect-backed and removed with its composition. The direct MySQL provider destroys its active connection on cancellation and awaits the driver settlement before returning. Credentials remain in provider configuration and never enter prompt context, tool output, or chart metadata. Superset/SSE compatibility and live metadata discovery are separate adapters.
