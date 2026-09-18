# Grading a Bridge run without retyping it

## What changed

Bridge's grade is one button. The panel keeps the question it sent, and a benchmark answer key held in the Host user-settings document under `ui-bridge` supplies what the answer should have been. Neither is typed.

- `ui-bridge`'s node half registers a durable `answerKey` settings section; the browser half binds the same namespace and hands the whole key to the grader.
- `BridgeState` gained `asked` — the last question sent to the lanes — and `keyGold`, the key's answer for it.
- `judge()` takes no arguments. It reads both from the snapshot.
- The bar lost its question box. Its answer box appears only for a question the key does not cover, and a typed answer still overrides the key.

## Why the question was the panel's to remember

The panel sends the prompt. It was asking for the same text back purely because `judge(question)` took it as an argument, and no other caller needed that. Recording the question at the point it is sent removes the field and removes a way to grade against a question that was never asked.

## Why the key is settings rather than shipped data

Which benchmark a deployment grades against differs by machine and changes without any code moving — the same reason the rate card in [`ui-cost`](../../../../packages/client/ui-cost/README.md) is a settings section. A key that shipped in the package would also make one suite's answers a product fact, which they are not.

The card ships empty, and an empty key is the deployment that grades by hand: the answer box is offered, exactly as before this change. Nothing degrades silently.

## Why the grader matches the question

This started as string matching in the browser — normalise both questions, then exact match or containment. It worked for a question pasted verbatim from the benchmark file and failed for every other way of asking, which is every way anyone actually asks. "How much did 3M spend on capital expenditures in fiscal 2018?" and "What is the FY2018 capital expenditure amount (in USD millions) for 3M?" are the same question and share almost no structure.

So the whole key goes into the prompt and the grader finds the row. Recognising a question asked in different words is what a model is for, and the fallback for a missed match was the typing this change exists to remove.

The cost is one wrong match away from a confident false verdict, so the grader reports the row it used and the bar shows it in the benchmark's wording. A reply naming no row marks nothing: rulings measured against an answer the panel cannot name are worse than no rulings. The key is roughly 40KB, about 11K prompt tokens per grade, spent in the grading session where it does not touch any lane's measured spend.

## Verified

A live run on the FinanceBench suite, asked in a person's words rather than the benchmark's: *"How much did 3M spend on capital expenditures in fiscal 2018?"* — a question the string matching this replaced could not have resolved.

Three lanes, nothing typed into the judge bar (`inputs to type into: 0`), and the grader's reply was `Q=financebench_id_03029 A=correct B=wrong:says-1540 C=correct` — the right row out of 150, and a real discrimination rather than three rubber stamps: the vector-search lane answered 1540 against a gold of $1577.00 and was marked wrong with its reason.
