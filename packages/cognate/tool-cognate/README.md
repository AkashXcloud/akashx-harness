---
description: "Model-facing Cognate SQL and deterministic chart tools."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-cognate

English | [中文](README.zh.md)

## Summary

`dsh-tool-cognate` registers `run_sql` and `render_chart`. `run_sql` sends one statement through `ctx.cognate`; the service owns SQL policy, cancellation, provider selection, and result bounds. `render_chart` validates tabular data already in its arguments and never opens a database connection.

## Table of Contents

- [Use this package](#use-this-package)
- [Further Exploration](#further-exploration)
- [Implementation Notes](#implementation-notes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Configuration

<a id="use-this-package"></a>
## Use this package

`contextMaxChars` bounds the dynamic semantic-context prompt contribution. `maxChartPoints` bounds chart rows. The plugin adds source-selection guidance: ordinary SQL for structured tables, completed Ontology View rows for typed extraction, `ASK` for known RagBuckets, and Bash for local process or filesystem work.

<a id="further-exploration"></a>
## Further Exploration

See the [Cognate subsystem reference](../../../docs/subsystems/cognate.md) and the [generated tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-cognate).

<a id="implementation-notes"></a>
## Implementation Notes

No runtime invariant companion is published because tool registration and model-visible results are covered by composition and tool tests, and the adapter owns no independent event or state relation.

<a id="model-experience"></a>
## Model Experience

### Tool schemas and results

#### What the model sees

The generated [`run_sql` and `render_chart` schemas`](../../../docs/tool-catalog.md#deepseek-aidsh-tool-cognate) expose one SQL argument or chart metadata and existing rows. `render_chart` cannot execute a query or access a provider.

#### Token effect

Tool schema tokens repeat on each request. Result tokens scale with the bounded rows, citations, and chart points supplied to the model.

#### KV Cache effect

Stable tool definitions and semantic context preserve request-prefix reuse. A changed tool configuration or context bound changes the prompt prefix.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- Charts are returned as structured presentation metadata; a dedicated client chart renderer is deferred.
- The tool does not provide a separate knowledge-search schema; production document retrieval uses AkashXDB operations supplied by the configured provider.

### Dev Note
<a id="dev-note"></a>

This package has no open maintainer decision beyond the deferred client chart renderer and provider-supplied knowledge operations.
