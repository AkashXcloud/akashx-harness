# @akashx/akx-client-ui-bridge

English | [中文](README.zh.md)

## Summary

AkashX Bridge: one question fanned across several mode-locked Sessions, each watched as its own live conversation and graded together.

## Why it exists

A Session is seated on exactly one agent preset, and a subagent inherits its parent's composition rather than taking a preset of its own. Comparing retrieval paths therefore means running several Sessions, not one Session with several children — the isolation that makes a comparison trustworthy is also what stops a single Session from performing it.

Bridge is the surface that makes running several practical. It spawns one Session per lane, sends one prompt to all of them, and shows what each answered beside what each spent.

## What it registers

| Slot | Entry | Purpose |
| --- | --- | --- |
| `sidebar.panellist` | `bridge` | The rail icon that selects the starter panel. |
| `main` | `bridge` | The starter: the mode picker, and the way back to the panes. |
| `conversation.panes.bar` | — | One question for every lane, and the one-button grade. |
| `conversation.pane.chrome` | — | One pane's mode, verdict, and what it spent. |

A lane is watched as a conversation, not as a summary of one. Opening a lane hands the screen to the conversation surface in [pane mode](../ui-conversation/README.md#panes-several-conversations-at-once): each pane is that Session's own transcript, streaming its steps and tool cards exactly as the single view does. Bridge names the Sessions and fills the two seats above and inside the panes; it renders no transcript of its own, so nothing can drift from what a conversation really shows.

The starter panel is what the rail selects, because the rail selects panels. It carries the mode picker before any lane exists, and the way back to the panes afterwards.

## Lanes are ordinary Sessions

A lane holds a Session id and nothing else. The Session a lane points at is the same Session the rest of the product already serves, with the same durable log, the same projections, and the same preset gate — which is why a pane can be that conversation rather than a view of it, and why a lane can be continued alone in the single view with no path back to build.

Every pane carries its own composer, so one lane can be steered directly while the others keep working.

That is also why per-lane mode selection reuses the agent-preset seat rather than reimplementing it: the seat controller takes a Session accessor, so one instance per lane binds to that lane's Session.

## Judging

Answers are graded by a Session of their own, never inside a lane. Grading spends tokens, and a lane's spend is the figure this panel exists to compare, so grading inside a lane would add to the very number being read. A lane also holds only its own answer, while a comparison needs all of them — which only the panel has.

The grade is blind: answers are shuffled and relabelled, and the lane each one came from is restored from the deal afterwards, so a grader cannot prefer the mode it has been told is interesting. The prompt also forbids the grader querying anything, because a grader that looked the answer up would be marking its own retrieval rather than the answers in front of it.

A letter the grader does not rule on yields no verdict. An ungraded answer must not read as a failed one.

### The grade takes no typing

Grading needs the question and the answer it should have produced. The panel already sent the question, so it keeps it; nothing is retyped to grade what was just asked.

The correct answer comes from a benchmark answer key held in the Host user-settings document under `ui-bridge`:

```yaml
ui-bridge:
  answerKey:                # the benchmark's id, its question, and its answer
    - id: financebench_id_03029
      question: What is the FY2018 capital expenditure amount (in USD millions) for 3M?
      gold: $1577.00
```

The key is configuration rather than shipped data: which suite a deployment grades against differs by machine and changes without any code moving.

### The grader matches the question, not the strings

The whole key goes into the grading prompt, and finding the row that was asked is the grader's first job. Nobody asks a question in the benchmark's own wording — they paraphrase it, they wrap it in retrieval instructions, they ask for the same figure a different way — and a string lookup that missed would put the typing straight back in front of them. Reading for what is being asked is the one part of this that needs a model.

The grader answers with the row it matched, which the bar then shows in the benchmark's wording. A grade always says what it was measured against, so a wrong match is visible rather than silent. A reply naming no row marks nothing at all: every ruling in it was measured against an answer the panel cannot name, which is worse than no grade.

Grading itself is lenient about form and strict about substance. The same figure in a different unit, format or phrasing is correct; a different figure, unit or period is not, and neither is a refusal.

A typed answer replaces the key for one grade, which is also how a deployment with no key at all grades — by hand, one box, as it did before the key existed.

## Model Experience

None, as this browser panel registers nothing model-facing: it sends prompts a person typed to Sessions that already exist, so a model reached through a lane sees exactly what it would see in the conversation view.

#### KV Cache effect

Nothing here enters a model request, so provider cache reuse is unaffected; a lane's cost is that Session's own cost.

## Known Limitations and Deferred Work

- Lanes are not persisted. A reload leaves the Sessions intact but empties the panel, because the lane roster lives in client state rather than in a durable projection.
- A lane's answer and its deployment spend both reach the panel by polling the Session list, because the list row is built before the turn outline has folded the turn that produced them. The poll starts when a question is sent and runs on past the last answer for a grace window; a checkpoint slower than that window shows the answer before the cost.
- The grade is read from the host's response preview, which is clipped well short of a full answer. A lane that states its figure only after the clip cannot be graded on it, even though its pane shows the whole answer.
- Selecting Bridge in the rail selects the starter panel; the panes live in the conversation panel, so the rail highlight moves off Bridge as soon as the panes open.
- The grader runs on the deployment's default preset, which can reach the database. Only the prompt stops it looking an answer up; there is no preset that withholds the capability.
- The grade is measured against the last question sent to the lanes. Asking a second question before grading the first replaces what a grade would be matched against.
- The whole answer key enters the grading prompt on every grade. A suite far larger than FinanceBench's 150 questions would need narrowing before it is sent.
- Which row the grader matched is reported but not checked. A confident wrong match is visible in the bar and nowhere else.
