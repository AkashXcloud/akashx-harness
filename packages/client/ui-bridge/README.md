# @akashx/akx-client-ui-bridge

English | [中文](README.zh.md)

AkashX Bridge: one question fanned across several mode-locked Sessions, watched side by side.

## Why it exists

A Session is seated on exactly one agent preset, and a subagent inherits its parent's composition rather than taking a preset of its own. Comparing retrieval paths therefore means running several Sessions, not one Session with several children — the isolation that makes a comparison trustworthy is also what stops a single Session from performing it.

Bridge is the surface that makes running several practical. It spawns one Session per lane, sends one prompt to all of them, and shows what each answered beside what each spent.

## What it registers

| Slot | Entry | Purpose |
| --- | --- | --- |
| `sidebar.panellist` | `bridge` | The rail icon that selects the panel. |
| `main` | `bridge` | The lane grid, which occupies the central column while selected. |

Both share the `bridge` panel id: the sidebar entry addresses the main occupant by that key, and `ctx.layout.selectPanel` switches between them. Selecting a panel does not change the current Session, so leaving Bridge returns to whatever conversation was open.

## Lanes are ordinary Sessions

A lane holds a Session id and nothing else. Steering one lane, or leaving Bridge to continue in the full conversation view, needs no special path back — the Session a lane points at is the same Session the rest of the product already serves, with the same durable log, the same projections, and the same preset gate.

That is also why per-lane mode selection reuses the agent-preset seat rather than reimplementing it: the seat controller takes a Session accessor, so one instance per lane binds to that lane's Session.

## Model Experience

Bridge adds no tool, no prompt section and no context injection. It sends prompts a person typed to Sessions that already exist, so a model reached through a lane sees exactly what it would see in the conversation view — the same system prompt, the same tools, the same preset gate. Token and KV-cache behaviour are unchanged; a lane's cost is that Session's own cost.

## Known Limitations and Deferred Work

- Lanes are not persisted. A reload leaves the Sessions intact but empties the panel, because the lane roster lives in client state rather than in a durable projection.
