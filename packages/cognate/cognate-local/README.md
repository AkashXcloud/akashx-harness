---
description: "Offline Markdown provider for Cognate development and tests."
kind: "package-reference"
---

# @akashx/akx-cognate-local

English | [中文](README.zh.md)

## Summary

`akx-cognate-local` preserves offline Cognate knowledge retrieval without adding a second agent, tool registry, or orchestration loop. It loads heading-aware Markdown sections and answers the existing `run_sql` path for one local `ASK` statement with bounded rows and citations. The shipped `cognate` preset does not mount this provider; production retrieval remains AkashXDB-backed.

## Table of Contents

- [Use this package](#use-this-package)
- [Further Exploration](#further-exploration)
- [Implementation Notes](#implementation-notes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

Configure `knowledgeDir` with a Markdown corpus and set the Cognate service provider to `local-markdown`. The provider accepts `ASK 'question' ON <bucket>` and returns ranked sections; it rejects ordinary SQL and never replaces the production MySQL provider.

<a id="further-exploration"></a>
## Further Exploration

See the [Cognate subsystem reference](../../../docs/subsystems/cognate.md) and the [native Cognate provider](../cognate-mysql/README.md).

<a id="implementation-notes"></a>
## Implementation Notes

No runtime invariant companion is published because the provider owns no shared registry or durable relation beyond its registered provider effect.

<a id="model-experience"></a>
## Model Experience

### Offline retrieval

#### What the model sees

The model sees bounded Markdown sections, document paths, heading citations, relevance scores, and an answer assembled from matching sections through `run_sql`.

#### Token effect

Result tokens scale with the configured result count and the 4,000-character section cap. The provider adds no model prompt context beyond its bounded RagBucket metadata.

#### KV Cache effect

The provider does not change the tool or prompt prefix. Changing the local corpus changes result tokens only.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- Retrieval uses deterministic term overlap rather than embeddings; deployment-native AkashXDB retrieval is required for production quality.
- The provider supports only `ASK` and does not execute structured SQL, ontology extraction, or concept-tree UDFs.

### Dev Note
<a id="dev-note"></a>

This package exists for offline development and tests; it is intentionally absent from the shipped production preset.
