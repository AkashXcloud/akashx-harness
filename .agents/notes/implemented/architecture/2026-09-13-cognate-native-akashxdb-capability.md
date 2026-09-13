# Agent Note: Cognate uses the native Harness loop and AkashXDB capability seam

Status: implemented

English | [中文](2026-09-13-cognate-native-akashxdb-capability.zh.md)

## Problem

Cognate needs structured AkashXDB queries, document retrieval, semantic-model context, and chart output inside the Harness. A second router, ReAct loop, tool registry, or synthesis pipeline would duplicate the Harness lifecycle, cancellation, approvals, session logging, and token accounting. AkashXDB also executes cognitive SQL through services and UDFs, so SQL syntax alone does not establish a read-only operation.

## Decision

Cognate is an additive Harness capability. `@deepseek-ai/dsh-cognate` owns `ctx.cognate`, provider selection, SQL classification, external-operation authorization, result bounds, and provider-supplied semantic context. `@deepseek-ai/dsh-cognate-mysql` supplies direct MySQL-wire execution and destroys its active connection on cancellation. `@deepseek-ai/dsh-cognate-local` supplies deterministic heading-aware Markdown retrieval for offline development and tests; it is not mounted by the shipped production preset. `@deepseek-ai/dsh-tool-cognate` owns the model-facing `run_sql` and deterministic `render_chart` tools plus Cognate source-selection guidance.

The `cognate` agent preset copies the Standard tool composition and adds the Cognate service, MySQL provider, and tools in an agent-local realm. Bash, filesystem, web, skills, sessions, goals, planning, workflows, subagents, and MCP remain separate Harness capabilities.

The service allows one metadata or ordinary read statement, enforces SQL, row, and serialized-result bounds, and denies mutation/admin statements. `ASK`, `PROMPT`, `cognitive_*`, and `excel_ai_*` statements are external operations and require `allowExternalOperations: true`. The service does not expose raw MCP write operations, credentials, or a Bash fallback.

`render_chart` consumes already-returned tabular data, validates chart columns and numeric series, enforces a point limit, and has no database provider dependency. It returns structured presentation metadata without a second chart-selection model call.

## Alternatives considered

**A second Cognate agent framework lost** because the Harness already owns the model loop, tool lifecycle, cancellation, durable events, replay, and token accounting.

**The raw AkashXDB MCP SQL bridge lost** because its read path does not enforce read-only SQL and its write path exposes mutation and administration operations. The direct provider keeps policy at the Harness capability seam.

**A separate chart-selection model lost** because chart metadata can be validated and produced deterministically from an existing bounded query result.

## Consequences

The native agent loop remains the only orchestration path and continues to own approvals, cancellation, durable tool events, replay, and token accounting. Direct MySQL transport is available without requiring a live database in tests through an explicit executor seam, while the local provider preserves the former Markdown knowledge path for offline retrieval. Semantic-model persistence and live catalog discovery remain deployment-owned provider inputs; Superset/SSE compatibility is a separate adapter.

## Required verification

The Cognate packages test SQL classification and denial, provider cancellation and lifecycle, bounded rows and bytes, semantic-context prompt assembly, chart validation, and real Loader composition. Repository checks must include TypeScript compilation, focused Cognate tests, package/dependency checks, Cordis configuration validation, documentation checks, and generated path/catalog freshness checks.
