# Grading a Bridge run without retyping it

## What changed

Bridge's grade is one button. The panel keeps the question it sent, and a benchmark answer key held in the Host user-settings document under `ui-bridge` supplies what the answer should have been. Neither is typed.

- `ui-bridge`'s node half registers a durable `answerKey` settings section; the browser half binds the same namespace and matches the question against it.
- `BridgeState` gained `asked` — the last question sent to the lanes — and `keyGold`, the key's answer for it.
- `judge()` takes no arguments. It reads both from the snapshot.
- The bar lost its question box. Its answer box appears only for a question the key does not cover, and a typed answer still overrides the key.

## Why the question was the panel's to remember

The panel sends the prompt. It was asking for the same text back purely because `judge(question)` took it as an argument, and no other caller needed that. Recording the question at the point it is sent removes the field and removes a way to grade against a question that was never asked.

## Why the key is settings rather than shipped data

Which benchmark a deployment grades against differs by machine and changes without any code moving — the same reason the rate card in [`ui-cost`](../../../../packages/client/ui-cost/README.md) is a settings section. A key that shipped in the package would also make one suite's answers a product fact, which they are not.

The card ships empty, and an empty key is the deployment that grades by hand: the answer box is offered, exactly as before this change. Nothing degrades silently.

## Why the match is strict

Two questions match when their words and figures agree after case, punctuation and whitespace are folded away — a paste picks up a newline, an editor curls an apostrophe, and neither changes which question was asked.

A stored question *contained in* what was asked also matches, because a demo prompt wraps the benchmark text in a retrieval hint. Containment runs one way only: a short prompt must not claim the answer to a longer question it happens to sit inside, since the lanes were not asked that question. Where two stored questions both fit, the longer one wins, which is the more specific of the two.

Nothing fuzzier is attempted. A near miss graded against another question's answer is a false verdict presented with the same confidence as a true one, and worse than no verdict at all.

## Verified

A live run on the FinanceBench suite: three lanes, one verbatim benchmark question with a bucket hint appended, no text entered into the judge bar at all (`inputs to type into: 0`), and three verdicts. The grading session's log carries `CORRECT ANSWER: $1577.00` — the suite's own answer for that question, reached from the key.
