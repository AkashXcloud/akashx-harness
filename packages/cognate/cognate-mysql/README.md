---
description: "Direct MySQL-wire AkashXDB provider for the Cognate capability."
kind: "package-reference"
---

# @deepseek-ai/dsh-cognate-mysql

English | [中文](README.zh.md)

## Summary

`dsh-cognate-mysql` registers `MysqlCognateProvider` on `ctx.cognate`. It connects directly to an AkashXDB/StarRocks MySQL endpoint, normalizes driver values to lossless JSON, and destroys the active connection when the caller signal aborts. URL credentials are never returned in context or results.

## Table of Contents

- [Use this package](#use-this-package)
- [Further Exploration](#further-exploration)
- [Implementation Notes](#implementation-notes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

Its host-only `probe()` method runs named capability statements sequentially and reports unsupported deployment grammar without adding another model-facing tool. Required probe failures are escalated by `ctx.cognate.probe()`.

## Configuration

Set `url` to a `mysql://` or `mariadb://` connection string, or provide `host`, `port`, `user`, `password`, and `database`. `semanticContext` supplies bounded table, ontology-view, RagBucket, metric, dialect, and instruction metadata to the Cognate prompt consumer. `queryTimeoutMs` is the provider backstop; the Harness tool policy remains the outer tool deadline.

<a id="further-exploration"></a>
## Further Exploration

See the [Cognate subsystem reference](../../../docs/subsystems/cognate.md).

<a id="implementation-notes"></a>
## Implementation Notes

No runtime invariant companion is published because connection lifecycle and normalized results are observed directly by provider tests, with no independent package-local relation to expose.

<a id="model-experience"></a>
## Model Experience

### Query results

#### What the model sees

The model sees bounded JSON rows and column names from `run_sql`, optional answer text, citations, and an external-operation marker. It never sees database credentials or connection options.

#### Token effect

Result tokens scale with the bounded returned rows and metadata. Provider configuration does not add prompt tokens.

#### KV Cache effect

Provider execution does not alter the prompt prefix. Reusing the same semantic context and tool definitions preserves request-prefix reuse.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- The provider uses the MySQL wire protocol; Arrow Flight and Superset/SSE adapters are not included.
- Metadata discovery and semantic-model persistence are deployment responsibilities supplied through `semanticContext`.

### Dev Note
<a id="dev-note"></a>

This provider has no open maintainer decision beyond deployment-owned metadata and future transport adapters.
