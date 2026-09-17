# Agent Note: deployment token telemetry for cognitive statements

Status: implemented

## Problem

A cognitive statement spends tokens on models the DEPLOYMENT owns, not on the model running the session. `ASK` answers through a RagBucket with its own chat model and reranker; `cognitive_ask` traverses a concept tree with another. The harness reported none of it: a session whose database burned more tokens than the session itself displayed only its own figure, and every per-question cost comparison between retrieval paths was therefore missing the cost of the retrieval.

The spend was already measured. Nothing collected it.

## Decision

`run_sql` results carry the deployment's spend, and a session projection totals it.

Both cognitive paths report, but through different channels, so each is read where it lands rather than through one uniform hook:

- **`ASK`** returns its counts as columns of its own single result row. `deriveUsage` reads them with no second round trip.
- **`cognitive_ask`** reports only through RuntimeProfile counters. The provider records the statement's query id on the connection the statement ran on — the id names the last statement and profiling is a session variable, so both rides must share that connection — and fetches the profile afterwards over the deployment's HTTP profile service.

Profiling is opt-in per deployment (`captureQueryId`, `profileUrl`). It costs a `SET enable_profile` and a `SELECT last_query_id()` per cognitive statement and makes the deployment retain a profile for each, so a deployment that reads no profiles pays nothing.

`deriveUsage` prefers the per-stage totals a telemetry build reports and falls back to the unprefixed answer-stage pair, so it reports on deployments with and without that build. The fallback is an undercount, not a wrong number — it omits the rewrite and rerank stages — which is why it is last rather than absent.

### Deployment spend is a separate figure, never a blended one

The totals are kept apart from the session's own token accounting rather than summed into it. The two pools are billed to different models at different prices, so one blended number answers no question correctly, and the first question anyone asks of a total is what it cost. `routes` carries the per-model attribution that lets a total be priced. A statement naming neither provider nor model still counts in the totals but contributes no route: inventing a label would misreport the price.

### The projection lives beside the tool that writes the payload

The fold reads `tool/result` `meta`, which the core documents as tool-private — the producing tool owns its shape. That ownership is why `cognateUsage` lives in `akx-tool-cognate` rather than in the generic token meter: nothing else may read into another tool's metadata. The registration is optional (`ctx.get('sessionProjections')`), so a host serving no projections still gets the tools.

## Alternatives considered

**One hook after every cognitive function.** Rejected: the three cognitive paths report through three different channels, and an ontology view reports nothing at query time at all because its extraction cost was paid at ingestion. A uniform hook would have to be a union of special cases anyway.

**Extend the `tokenUsage` projection.** Rejected twice over: it would bump a durable projection's state version for data it should not blend, and `token-meter` is LLM-generic while the payload is one tool's private metadata.

**Fold `tool/result` in a generic `toolUsage` unit.** Rejected for the same ownership rule. The concept generalizes; the payload does not.

**Read the tool result's rows in the UI.** Rejected: the composer figures ride durable whole-log projections precisely because the window is paged and compaction rewrites it, so a fold over what is on screen would be wrong after either.

## Consequences

Cost and deployment-side latency are now attributable per question across the retrieval paths, which is what a comparison between them needs. The session's own accounting is unchanged, and a session that never issues a cognitive statement totals zero.

`akx-client-ui-chat` now depends on `akx-tool-cognate` for the projection's client-face types. That couples a generic chat surface to a domain package, where the same file's existing projection imports are generic. The idiomatic replacement is a small client plugin mounting on the same `conversation.composer.dock` slot the pills already use; it is a contained follow-up, not a rewrite.

`ASK` on a deployment without the per-stage telemetry build reports its answer stage only, so its figure understates the reranker — which bills in search units rather than tokens — and the rewrite call. The understatement flatters `ASK` in exactly the comparison this telemetry exists to serve, so the deployment's build state is a precondition for reading those numbers, not a detail.
