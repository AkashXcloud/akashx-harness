---
description: "Package map for the AkashXDB Cognate capability: provider service and model-facing query tools."
kind: "package-group"
---

# cognate/ — AkashXDB Cognate capability

English | [中文](README.zh.md)

## Summary

The `cognate/` packages connect a native Harness agent to AkashXDB. The service owns provider selection, SQL classification, external-operation policy, result bounds, and bounded semantic context. The MySQL provider uses the AkashXDB MySQL wire protocol, while the tool consumer exposes `run_sql` and deterministic `render_chart`.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`cognate/`](cognate/README.md) | Provider registry, SQL policy, result bounds, and semantic-context service | `ctx.cognate` |
| [`cognate-mysql/`](cognate-mysql/README.md) | Direct MySQL-wire AkashXDB provider | registers on `ctx.cognate` |
| [`cognate-local/`](cognate-local/README.md) | Offline Markdown knowledge provider for development and tests | registers on `ctx.cognate` |
| [`tool-cognate/`](tool-cognate/README.md) | `run_sql`, `render_chart`, and Cognate prompt/context contributions | `ctx.tools` |

<a id="related-documentation"></a>
## Related documentation

- [Cognate subsystem](../../docs/subsystems/cognate.md) — shared types, policy, provider, and tool contracts.
- [Agent preset reference](../preset/agent-presets/README.md) — the shipped `cognate` composition.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers</summary>

The direct provider intentionally does not expose the raw AkashXDB MCP write surface. Cognitive SQL is classified as an external operation because AkashXDB UDFs can call HTTP services, workers, Redis, storage, or LLM providers.

</details>
