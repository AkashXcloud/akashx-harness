# Agent Note: AkashX Bridge, parallel lanes and blind grading

Status: implemented

## Problem

Comparing retrieval paths means running the same question through several of them and reading what each answered and what each spent. A Session is seated on exactly one agent preset, and a subagent inherits its parent's composition rather than taking a preset of its own, so the comparison cannot be run inside one Session: the preset isolation that makes the comparison trustworthy is exactly what stops a single Session from performing it.

Running the Sessions by hand works and is unwatchable. The answers arrive minutes apart in different conversations, the spend figures have to be collected one at a time, and nothing puts them beside each other at the moment anyone is looking.

## Decision

A client panel, `akx-client-ui-bridge`, opens one Session per lane, sends one prompt to all of them, and shows each lane's answer beside its cost. A lane holds a Session id and nothing else, so steering one lane, or leaving Bridge to continue in the conversation view, needs no path back: the Session a lane points at is the same Session the rest of the product serves, with the same durable log, projections and preset gate. Per-lane mode selection reuses the agent-preset seat rather than reimplementing it.

The node half is empty. Bridge registers no tool, no prompt section and no context: a model reached through a lane sees exactly what it would see in the conversation view.

### Readings come from the Session list, not from an event window

Every figure a lane reports is read from that Session's own projections as served on the Session list. An event window only fills for a Session the client has opened, and only one Session is open at a time, so a panel watching several at once cannot use it. One list subscription covers every lane rather than one subscription per lane.

The harness total and the deployment total stay apart, for the reason [the telemetry note](2026-09-17-deployment-token-telemetry-for-cognitive-statements.md) gives: they are billed to different models at different prices, and blending them answers no question correctly.

### Answers arrive by polling, tied to the question

A lane's list row is built while its `turn/end` event is still being handled, before the turn outline has folded that same event, so the row carries an empty response and nothing rebuilds it afterwards. Sending a question therefore starts a poll that re-reads the Session list until every lane has answered.

The poll is tied to the question rather than to an observed running-to-idle transition, because the list does not reliably show one — an earlier version keyed on that transition and the panel simply never saw it. It runs on past the last answer for a grace window, because the deployment spend reaches the list through a write-behind checkpoint and is still absent at the moment its answer appears; a cost that lands after the panel stopped looking reads as a path that spent nothing. It gives up rather than polling for the life of the panel, and a second question replaces the poll rather than racing it.

### Grading happens in a Session of its own, blind

Grading spends tokens, and a lane's spend is the figure the panel exists to compare, so grading inside a lane would corrupt the measurement at the moment it is read. A lane also holds only its own answer, while a comparison needs all of them — which only the panel has. The grader therefore runs as its own Session.

Answers are shuffled and relabelled by letter before grading and the lane is restored from the deal afterwards, so a grader cannot prefer the mode it has been told is the interesting one. The prompt forbids the grader running any query: a grader that looked the answer up would be marking its own retrieval rather than the answers in front of it. A letter the grader does not rule on yields no verdict, because an ungraded answer must not read as a failed one.

The verdict is read back from the grading turn's response preview, which the host clips well short of a full reply. The grade is therefore one short line — one token per answer — so a five-lane run does not lose its last verdicts to the clip.

## Alternatives considered

**Subagents instead of Sessions.** Rejected: a subagent inherits its parent's composition, so five subagents would all run one preset and compare nothing.

**Read each lane through its conversation event window.** Rejected: the window fills only for the open Session, and Bridge opens none — opening means becoming the current Session, and there is only one of those.

**Materialize each lane's turn outline from the node half.** Implemented, measured, and removed. The theory was that a projection cell is built on first touch and the list hints carry only cells that exist, so a Session nobody opened would never report its outline. The cell turns out to be materialized already; driving the panel end to end with the node half empty produced the same answers, verdicts and figures. It cost two structural casts across the Host/Client face split and bought nothing.

**Grade inside each lane and collect the verdicts.** Rejected: it adds the grader's tokens to the very figure being compared, and no lane can see another lane's answer.

## Consequences

The comparison is watchable: one question, one screen, each path's answer beside what it cost and what a blind grader made of it. That is what makes the five-mode isolation demonstrable to someone who is not reading a transcript.

The cost is a poll. The panel re-reads the Session list on a timer while a question is in flight, because the list does not tell it when a lane's answer is ready. A checkpoint slower than the grace window shows a lane's answer before its cost, and a lane that never answers keeps the poll running until it gives up.

Lanes are not durable. A reload leaves the Sessions intact and empties the panel, because the roster lives in client state rather than in a projection.

A lane shows the host's response preview, which is clipped well short of a full answer, and the grade is read from the same preview. A lane that states its figure only after the clip cannot be graded on it.

The grader runs on the deployment's default preset, which can reach the database. Only the prompt stops it looking an answer up; no preset withholds the capability.

## Verification

Driven end to end through the browser against the live deployment: three lanes (concept tree, vector search, chunk SQL) opened on their own presets, one question fanned to all three, answers and both token totals rendered in every lane, the grader marked all three correct, and the verdicts landed on the right lanes.

```
Concept Tree only  correct | HARNESS 13.6K DATABASE 42.6K ELAPSED 38s
Vector search only correct | HARNESS 17.4K DATABASE 0     ELAPSED 6.7s
Chunk SQL only     correct | HARNESS 16.7K DATABASE 0     ELAPSED 8.0s
```

The deployment figures depend on `AKASHXDB_PROFILE_URL` reaching the process: without it `cognitive_ask` has no profile to read and a concept-tree lane reports a deployment spend of zero, which is indistinguishable from a path that genuinely spent nothing.
