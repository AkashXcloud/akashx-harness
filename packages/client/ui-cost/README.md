# @akashx/akx-client-ui-cost

English | [中文](README.zh.md)

What a session cost in money: a deployment's configured rates applied to the tokens the session and the database spent.

## Why it exists

Token counts answer "how much work", not "how much money". The two diverge sharply here: a cognitive statement spends the deployment's tokens on models the deployment pays for, at prices unrelated to the agent's own model, so a session whose database burned three times its own tokens can still be the cheaper path — or the dearer one. Nothing in a token count says which.

## Rates are configuration, never code

A model's price is a deployment fact: it differs by contract, by region and by date, and it changes without any code moving. The rate card is therefore validated `Config`, keyed `provider/model` with a bare `model` fallback so the same model can be priced differently on two providers.

The card ships empty, and an empty card prices nothing. A model absent from the card makes its side of the reading **unpriced** rather than free — a missing rate and a free model are different facts, and only the second one is a claim. Surfaces show nothing at all rather than `$0`.

```yaml
- id: ui-cost
  name: '@akashx/akx-client-ui-cost'
  config:
    rates:                              # US dollars per million tokens
      'openai/gpt-5.6-luna': { input: 1.25, cachedInput: 0.125, cacheWrite: 1.5625, output: 10 }
      'foundry/gpt-5-nano': { input: 0.05, output: 0.4 }
```

`cachedInput` and `cacheWrite` default to `input` when the contract does not price them apart.

## What it registers

| Slot | Entry | Purpose |
| --- | --- | --- |
| `conversation.composer.dock` | `cost` | The money pill beside the session's token pills. |

It also publishes `ctx.cost`, whose `price` applies the card to one session's projection values. Callers pass values rather than a session id because the two surfaces that need it read from different places: the pill from its own session's projection seat, and Bridge from the Session list, which is the only source that serves a session the client has not opened.

## The two pools stay apart

The agent's own spend and the deployment's are priced separately and reported separately, for the reason [the telemetry keeps them apart](../../cognate/tool-cognate/README.md): they are billed to different models at different prices. The pill adds them for its headline figure and names both in its tooltip; a comparison between retrieval paths reads the parts, not the sum.

## Model Experience

This package adds no tool, no prompt section and no context injection. It reads projections the Host already serves and renders a number. Token and KV-cache behaviour are unchanged.

## Known Limitations and Deferred Work

- The agent side is priced at the session's *last used* model. A session that switched models mid-run is priced entirely at the newer one, because `tokenUsage` totals are not split by model.
- Reasoning tokens are not priced separately. Where a contract bills them apart from output, the figure understates the agent side.
- Rates are per million tokens only. Per-request, per-image and minimum-charge terms are not expressible.
