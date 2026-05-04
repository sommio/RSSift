---
title: Article summary prompt does not replace `{lang}` and is driven by deployment language only
date: 2026-05-04
category: integration-issues
module: article summary
problem_type: integration
component: llm_prompt
severity: medium
applies_when:
  - reviewing article summary prompt construction
  - diagnosing why `ja` or `en-US` do not appear as a substituted system-prompt language token
  - checking whether summary output is controlled by a user-level language setting
tags:
  [
    article-summary,
    llm,
    prompt,
    language,
    config,
    openai-compatible,
    integration,
  ]
---

# Article summary prompt does not replace `{lang}` and is driven by deployment language only

## Problem

`apps/api/src/article-summary/article-summary.prompt.ts` describes the system prompt with a `{lang}` placeholder, but the placeholder is not interpolated inside that file. The actual prompt builder receives `language` as a field, and `ArticleSummaryGateway` passes `config.llmSummary.language` into the user-message example/input chain. As a result, the runtime language contract is deployment-scoped, not user-scoped, and the system prompt text itself still contains a literal `{lang}` token.

## Symptoms

- Changing `LLM_SUMMARY_LANGUAGE` to values such as `ja` or `en-US` affects the value passed through config, but does not replace `{lang}` inside the system prompt string.
- There is no per-user language selector in the current pipeline, so the summary output does not track an individual reader preference.
- The prompt can look correct at a glance while still leaving an unresolved placeholder in the system message.

## What Did Not Work

- Assuming `{lang}` is automatically substituted by the prompt helper.
- Treating `LLM_SUMMARY_LANGUAGE` as a per-user setting instead of a deployment setting.
- Relying on the later `Language: ${input.language}` user message to imply that the system prompt placeholder is also resolved.

## Solution

Treat article summary language as a single deployment-level configuration and make the prompt contract explicit:

- `LLM_SUMMARY_LANGUAGE` provides the target language for the whole deployment.
- `ArticleSummaryGateway` passes that language value into the prompt input.
- The prompt text should either interpolate the language explicitly or stop mentioning `{lang}` and describe the contract in plain language.
- If the product ever needs reader-specific language selection, it should be modeled as a separate feature, not as an implicit behavior of the summary pipeline.

## Why This Works

This keeps the runtime contract honest:

- config owns the target language
- the prompt owns the wording rules
- the gateway owns message assembly
- the reader does not implicitly control summary language unless a dedicated product setting exists

That separation prevents a false belief that `ja` or `en-US` are being normalized or substituted automatically when they are only being forwarded as configuration.

## Prevention

- Do not leave placeholder tokens in system prompts unless a builder explicitly replaces them.
- Keep deployment-level language configuration separate from user-level preferences.
- Add a test that inspects the assembled messages and verifies the system prompt matches the intended language contract.

## Related Context

- `apps/api/src/article-summary/article-summary.prompt.ts`
- `apps/api/src/article-summary/article-summary.gateway.ts`
- `apps/api/src/config/app-config.ts`
- `apps/api/src/config/env.validation.ts`
- `docs/en/plans/2026-04-18-001-feat-v0-1-llm-summary-reader-plan.md`
- `docs/zh-Hans/plans/2026-04-18-001-feat-v0-1-llm-summary-reader-plan.md`
