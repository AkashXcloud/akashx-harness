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

Every lane carries a control that hands it over to the conversation view, where it is served with its whole transcript, its own composer and its tools. Leaving the panel does not end the run: the other lanes keep working and report again on return.

That is also why per-lane mode selection reuses the agent-preset seat rather than reimplementing it: the seat controller takes a Session accessor, so one instance per lane binds to that lane's Session.

## Judging

Answers are graded by a Session of their own, never inside a lane. Grading spends tokens, and a lane's spend is the figure this panel exists to compare, so grading inside a lane would add to the very number being read. A lane also holds only its own answer, while a comparison needs all of them — which only the panel has.

The grade is blind: answers are shuffled and relabelled, and the lane each one came from is restored from the deal afterwards, so a grader cannot prefer the mode it has been told is interesting. The prompt also forbids the grader querying anything, because a grader that looked the answer up would be marking its own retrieval rather than the answers in front of it.

A letter the grader does not rule on yields no verdict. An ungraded answer must not read as a failed one.

## Model Experience

Bridge adds no tool, no prompt section and no context injection. It sends prompts a person typed to Sessions that already exist, so a model reached through a lane sees exactly what it would see in the conversation view — the same system prompt, the same tools, the same preset gate. Token and KV-cache behaviour are unchanged; a lane's cost is that Session's own cost.

## Known Limitations and Deferred Work

- Lanes are not persisted. A reload leaves the Sessions intact but empties the panel, because the lane roster lives in client state rather than in a durable projection.
- A lane's answer and its deployment spend both reach the panel by polling the Session list, because the list row is built before the turn outline has folded the turn that produced them. The poll starts when a question is sent and runs on past the last answer for a grace window; a checkpoint slower than that window shows the answer before the cost.
- A lane shows the host's response preview, which is clipped well short of a full answer. The grade is read from the same preview, so a lane that states its figure only after the clip cannot be graded on it.
- The grader runs on the deployment's default preset, which can reach the database. Only the prompt stops it looking an answer up; there is no preset that withholds the capability.
