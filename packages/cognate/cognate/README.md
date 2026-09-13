---
description: "Service definition for provider-backed AkashXDB execution used by Cognate agents."
kind: "package-reference"
---

# @deepseek-ai/dsh-cognate

English | [中文](README.zh.md)

## Summary

`dsh-cognate` provides `ctx.cognate`, a provider registry that classifies and authorizes one SQL statement before execution. It bounds SQL length, rows, and serialized results, and exposes only provider-supplied semantic metadata. The service does not execute SQL itself and does not expose credentials.

## Table of Contents

- [Use this package](#use-this-package)
- [Further Exploration](#further-exploration)
- [Implementation Notes](#implementation-notes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

Host code can call `ctx.cognate.probe()` with named deployment capability statements. Each statement passes the same SQL policy as `run_sql`; a required unsupported probe fails loudly, while optional probes return an unsupported result for deployment-owned feature selection.

Mount the service beside one provider and a model-facing consumer. `registerProvider()` returns a disposer. Configure `allowExternalOperations` explicitly before enabling `ASK`, `PROMPT`, `cognitive_*`, or `excel_ai_*` statements.

<a id="further-exploration"></a>
## Further Exploration

See the [Cognate subsystem reference](../../../docs/subsystems/cognate.md).

<a id="implementation-notes"></a>
## Implementation Notes

No runtime invariant companion is published because provider registration and policy observations are owned by this service and are covered through the provider and tool composition tests.

<a id="model-experience"></a>
## Model Experience

### Provider policy

#### What the model sees

The model sees the policy through `run_sql` outcomes: accepted metadata and read statements return normalized data, while mutation, stacked, unknown-function, and disabled external-operation requests return explicit errors.

#### Token effect

Policy diagnostics are emitted only for failed calls. Successful result tokens scale with bounded rows, columns, citations, and optional answers.

#### KV Cache effect

The policy does not change the prompt prefix. Stable tool definitions and semantic context preserve request-prefix reuse.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- Provider selection is process-local and requires one usable provider or an explicit provider id.
- Semantic context is supplied by the provider; live catalog discovery is not performed by this service.

### Dev Note
<a id="dev-note"></a>

This package has no open maintainer decision beyond deployment-owned catalog discovery and future provider adapters.
