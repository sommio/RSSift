---
title: Article summary parser should be removed until agent loops can enforce valid LLM output
date: 2026-05-04
category: workflow-issues
module: article summary
problem_type: workflow_gap
component: parser
severity: medium
applies_when:
  - reviewing `ArticleSummaryParser`
  - deciding whether `invalid_summary_payload` should trigger retries or reprompting
  - planning LLM output validation strategy for article summaries
tags: [article-summary, llm, parser, validation, agent-loop, workflow]
---

# Article summary parser should be removed until agent loops can enforce valid LLM output

## Problem

`apps/api/src/article-summary/article-summary.parser.ts` validates the LLM payload after generation and returns `invalid_summary_payload` when the shape does not match the schema. Today that failure is treated as terminal in `ArticleSummaryService`: it becomes `LLM_BAD_RESPONSE`, is persisted as a failure, and does not trigger a retry or a second LLM call. In practice, that means the parser is only acting as a rejection gate, not as an active recovery mechanism.

## Symptoms

- The parser can tell us that the output is malformed, but it cannot make the model generate a better answer.
- `invalid_summary_payload` is converted into a terminal failure instead of a correction loop.
- The system still pays the cost of prompt execution, then throws away the result when one required field is missing or malformed.
- The current behavior creates the impression of output control, but it does not improve output stability.

## Why This Feels Redundant

The current pipeline has no agent loop, no corrective reprompt, and no structured repair step. Because of that:

- validation happens after generation, not during recovery
- parser failures do not feed back into the LLM
- the only observed effect is a terminal bad-response code

That makes the parser a thin post-check rather than a useful orchestration primitive. If the product does not plan to retry with a repaired prompt or a stricter agent loop, the parser does not change the outcome enough to justify its existence.

## Solution

Treat the parser as temporary infrastructure and remove it from the hot path until the summary pipeline can actively recover from malformed outputs.

Recommended direction:

- delete `ArticleSummaryParser` from the current execution path
- let the gateway or service return the raw LLM payload or fail fast on obvious transport-level problems only
- introduce an agent loop or equivalent repair workflow before re-adding structured payload validation
- if validation returns, make it part of a loop that can actually ask the model to fix the response and try again

## Why This Works

This keeps the system honest about what it can do today.

- A parser that only rejects output does not improve generation quality.
- A retry loop without a repair strategy just repeats the same bad answer.
- An agent loop can use validation as feedback, which is where schema checking becomes useful.

Until that loop exists, the parser adds complexity without delivering recovery.

## Prevention

- Do not keep schema validators in the hot path unless they can influence the next generation attempt.
- Separate “validate shape” from “recover from shape failure.”
- If malformed LLM output is expected, define the corrective loop first, then add validation as feedback.
- Prefer raw payload inspection over false confidence from a validator that only produces terminal failures.

## Related Context

- `apps/api/src/article-summary/article-summary.parser.ts`
- `apps/api/src/article-summary/article-summary.service.ts`
- `apps/api/src/article-summary/article-summary.service.spec.ts`
- `docs/en/solutions/integration-issues/article-summary-prompt-language-contract-2026-05-04.md`
- `docs/zh-Hans/solutions/integration-issues/article-summary-prompt-language-contract-2026-05-04.md`
- `docs/en/solutions/logic-errors/article-summary-retryable-failures-must-not-clear-existing-summary-2026-04-18.md`
- `docs/zh-Hans/solutions/logic-errors/article-summary-retryable-failures-must-not-clear-existing-summary-2026-04-18.md`
