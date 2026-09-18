# Agent Note: several conversations on screen at once

Status: implemented

## Problem

[Bridge](2026-09-18-akashx-bridge-parallel-lanes-and-blind-grading.md) compared retrieval paths by showing each lane's final answer as a clipped preview in a box. While a comparison runs, that is the least interesting thing on the screen: what a person watches is the work — which tool each mode reached for, what the database was asked, how long each step took, the answer arriving. The conversation view already shows all of it. A lane showed a summary of it, arriving a minute late.

Two things stopped a lane from simply being a conversation, and both had to go.

**A lane had no events to render.** A Session's history window opens only while that Session is on stage, and the stage is `list.current` — one Session, because only one can be current. A lane is never current, so nothing streamed for it; the panel could only read host-computed projections served with the Session list.

**Only one registration may render a conversation.** A slot name is declared exactly once and `renderSlot` refuses a key the calling entry did not declare, so the conversation subtree is renderable solely by the `main#conversation` entry that declares `main.conversation`. No other package can host a conversation, whatever it does with scopes.

## Decision

### The stage widens: `ISessions.hold`

A surface that shows a Session without making it current holds it. A held Session keeps its scope and its open window for as long as the hold lasts, survives a removal the way the staged one does, and is torn down normally once released. Holds nest, so two panes on one Session release correctly.

This is the evolution the service was written for — its scope-lifecycle comment already said the staged state could widen to a multi-pane list — rather than a second lifecycle beside it. `current` still drives the single view; holds add to it.

### Panes are the conversation subtree, re-bound

`ctx.uiConversation.showPanes(ids)` puts the conversation panel into pane mode, and the panel renders `main.conversation` once per pane. Each pane is wrapped in `ScopeIdentityProvider`, which binds the session scope to a named identity instead of to the current selection; everything below reads its binding from that context, so the entire subtree — transcript, tool cards, composer, header, stats — resolves against that pane's Session.

The consequence is the point: a pane is not a rendering of a conversation, it **is** the conversation the product already serves. Nothing is reimplemented per pane, and nothing can drift from the single view, because there is only one implementation.

Two slots belong to whoever set the panes: `conversation.panes.bar` above the grid, and `conversation.pane.chrome` inside each pane, session-scoped so it binds to that pane rather than to the current Session.

### Bridge keeps only what is its own

Bridge names the Sessions, fills the bar with the shared question and the grade, and puts each lane's mode, verdict and spend in its pane's header. It renders no transcript. Its `main` panel is now the starter: the rail selects panels, so something must answer the rail, and it carries the mode picker before any lane exists and the way back to the panes afterwards.

## Alternatives considered

**Render the lane transcript inside Bridge's own panel.** Impossible, not merely undesirable: `renderSlot` authorizes by declaration and `main.conversation` is declared by the conversation panel. A second declaration throws at registration.

**Give Bridge its own transcript renderer over the `chat` fold.** The fold is reachable per binding, so this would have worked. Rejected: it duplicates the one thing that must not drift. Two renderings of the same conversation disagree eventually, and the disagreement always surfaces in front of an audience.

**Make each lane current in turn.** Only one Session is current by construction; a comparison watched one lane at a time is not a comparison.

**Persist pane mode.** Deferred. A reload returns to the single view, which is recoverable in one click, and a durable pane list would have to answer what happens when a pane's Session is deleted between reloads.

## Consequences

The comparison is watchable as work rather than as results: five modes, five live conversations, each streaming its own steps beside the others.

A pane is a full conversation, so each carries its own composer. One lane can be steered directly while the others keep working, and the panel-level focus control is no longer the only way to address one lane.

The stage now has two kinds of occupant. `current` still means "the Session the product is about", and holds mean "shown somewhere". A surface that holds and forgets to release keeps a window open and a scope alive; the holder owns that, and the pane list releases on every replacement and on disposal.

Panes share the width in one row, so a wide comparison is cramped rather than wrapped or scrolled.

`ui-conversation` now imports a value from `ui-renderer/client`, declared in its `akx.client.external`. The client bundle's purity gate requires the declaration, and the shared module table is what keeps one React context identity across plugin bundles.

## Verification

Driven end to end through the browser against the live deployment: three lanes opened on their own presets, one question fanned to all three, each pane rendering its own conversation — system prompt, context injections, the `run_sql` tool call, the streamed answer — with its own composer and stats row, while Bridge's header reported that lane's spend and the grader's verdict.
