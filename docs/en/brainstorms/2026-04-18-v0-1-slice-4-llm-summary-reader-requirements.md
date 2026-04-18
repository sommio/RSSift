---
date: 2026-04-18
topic: v0-1-slice-4-llm-summary-reader
---

# v0.1 Slice 4 LLM Summary Reader Requirements

## Problem Frame

`tmp/v0.1/v0.1.md` defines the v0.1 product as a summary-first RSS filter rather than a conventional RSS reader. The user problem is not only that many subscribed sources are English, but also that feed titles alone do not provide enough information to decide which articles deserve deeper reading time.

The previous slice established durable article-body Markdown. The next slice should turn that substrate into the first real product value: once an article has both a title and extracted body Markdown, the system should internally produce a readable summary artifact that the web reader can consume directly. This slice should prove the end-to-end product loop `feed -> content extraction -> summary generation -> dual-pane reading -> jump to original` without exposing public write APIs or requiring reading-time generation.

Verified current-state context:

- `apps/api/prisma/models/article.prisma` already has `contentMarkdown`, `contentExtractedAt`, and a compatibility `summary` field on `Article`, but it does not yet have a dedicated field for the translated title.
- `apps/api/src/articles/article.repository.ts` and `apps/api/src/articles/articles.service.ts` already expose `summary` on `GET /articles/:id`.
- `apps/web/src/widgets/article-reader/ui/article-detail.tsx` already renders the detail pane as a summary-focused reading view with a jump-to-original action.
- `apps/api/src/article-content/article-content.controller.ts` still exposes `POST /article-content/:id/retry`, which conflicts with the desired read-only public product surface for this slice and creates unnecessary future security exposure.
- `apps/api/src/config/env.validation.ts` and `apps/api/src/config/app-config.ts` currently contain no LLM-gateway configuration, so this slice needs an intentionally thin LLM integration boundary instead of pulling advanced gateway capabilities into the product requirements.

## Requirements

**Summary Product Behavior**

- R1. The system must treat AI summary generation as a core internal production step for article reading, not as an optional helper triggered by article viewing.
- R2. The first LLM summary input must be the article title and extracted `contentMarkdown` together as one semantic unit.
- R3. The first persisted AI output must contain one result set that succeeds together: a separately persisted target-language title and a fixed-format reading summary designed to help the user decide whether to continue to the original article; the deployment default language is `zh-CN`, but the backend must preserve a single target-language configuration entry.
- R4. The fixed-format summary must contain three layers in one Markdown string: a target-language title generated from the combined `title + contentMarkdown` context, a short key-information paragraph, and an ordered list of core points.
- R5. The product must keep the existing reader model that the user reads the prepared summary first and uses a “jump to original” action for deeper reading.

**LLM Gateway and Configuration Boundary**

- R6. The first slice must constrain external LLM integration to a single OpenAI-compatible API surface instead of introducing a provider-specific integration layer.
- R7. The first slice must keep backend configuration to the minimum set: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, and `LLM_SUMMARY_LANGUAGE`; the language default is `zh-CN`.
- R8. The first slice may keep one thin extra configuration for request timeout control, but it must not require retry policy settings, fallback matrices, provider-type switches, or complex routing strategy inputs.
- R9. The product must explicitly treat upstream gateway error handling as part of the external dependency responsibility instead of rebuilding a complex error-orchestration system inside this repository.

**Prompt Contract and Summary Structure**

- R10. The first slice must use one fully English system prompt to constrain summary generation behavior instead of scattering product rules across multiple call sites.
- R11. The system prompt must explicitly require the model to rely only on the provided `title` and `contentMarkdown`, must not introduce outside facts, and must not turn uncertainty into certainty.
- R12. The system prompt must explicitly require the layered reading-summary structure: first a target-language title generated from the full context, then one short summary paragraph, then an ordered list of core points, with all three layers stored in the same Markdown string.
- R13. The first-slice system prompt must include a small few-shot set to stabilize summary hierarchy, tone, length, and Markdown shape; the purpose of the few-shot examples is output-shape control, not complex agent behavior.
- R14. The system prompt must make the language contract explicit: output language is determined by a runtime `{lang}` placeholder whose value comes from `LLM_SUMMARY_LANGUAGE`, not by the article source language or by model guesswork.
- R15. The system prompt must define a conservative failure posture: when source material is incomplete, messy, or inconclusive, the model may produce a cautious summary but must not fabricate missing information.
- R16. The system prompt must explicitly state that `## Title` means “the original title translated into `{lang}`”, not a rewritten headline, a summary headline, or an editorialized replacement.

**Internal Trigger and Persistence**

- R17. Summary generation must be triggered internally after article content extraction succeeds, not by a public HTTP write request and not by opening the article in the UI.
- R18. The first slice must cover two article groups: newly enriched articles and older articles that still do not have a complete summary result.
- R19. The first slice must add a dedicated `Article` field for the translated title instead of treating the title as something that only lives inside the summary Markdown.
- R20. The generated Markdown summary must persist to the existing `Article.summary` field in the first slice.
- R21. `translatedTitle` and `summary` must only be written as one complete result set; partial writes are not allowed.
- R22. If generation succeeds again later for the same article, the new `translatedTitle` and `summary` must overwrite the old values; the first slice does not keep version history.
- R23. Persisted summaries must be reusable across later reads; the system must not require a fresh LLM call every time the article detail page is opened.
- R24. Summary generation failures must fail open: the article may remain readable in the system even if no high-quality AI summary is produced yet.

**Public Surface and UX Contract**

- R25. The public product surface for this slice must remain read-oriented: the user should receive prepared summaries through the existing article read paths rather than through a public summary-generation endpoint.
- R26. The slice must delete the current public repair-style write surface `POST /article-content/:id/retry` instead of keeping or soft-deprecating it.
- R27. The removal of `POST /article-content/:id/retry` is a product and safety requirement: this slice must avoid leaving behind an unnecessary public write surface that could expand the later security burden.
- R28. Both article list and detail views must prefer the persisted translated title and fall back to the original `title` only when `translatedTitle` is empty.
- R29. `GET /articles/:id` must continue to return summary-reader output for direct web consumption; if translated title needs to be exposed, it should be part of the read result instead of being reconstructed from `summary`.
- R30. The summary reader experience must remain desktop-first and dual-pane.

**Fallback and Reliability**

- R31. If body extraction is unavailable, this slice does not need to guarantee a full AI summary for that article.
- R32. For temporary OpenAI-compatible gateway failures, the first slice must perform 3 implicit retries spaced 1 minute apart; retries apply only to clearly temporary failures such as timeouts, `429`, and `5xx`.
- R33. If generation still fails after retries, the system must not write either `translatedTitle` or `summary`; the persisted state should remain empty for later error handling.
- R34. Structured-output parsing uses a semi-strict strategy: small heading variations in casing or spacing are allowed, but the parser must still reliably identify `Title`, `Summary`, and `Key Points`.
- R35. If the `Title` section is missing, unrecognizable, or the overall three-part structure cannot be semi-strictly parsed, the whole generation attempt must fail rather than partially persist.
- R36. `Key Points` count is a soft constraint, not a hard failure rule; once the three sections exist, counts outside 3-5 do not fail the attempt.
- R37. The first slice does not add extra edge-case repair logic, non-LLM mechanical summaries, or partial salvage behaviors; failure should follow the simplest path.
- R38. The first slice does not require complex application-level error taxonomy, provider-specific error mapping, or multi-stage fallback orchestration; it only needs the minimum result boundary such as success / failure / timeout.
- R39. The first slice may keep observability lightweight through logs and tests; it does not require a user-facing jobs console, queue dashboard, or summary-history model.

## Success Criteria

- Newly enriched articles and older missing articles can progress from persisted title and `contentMarkdown` to a persisted complete summary result without a reading-time trigger, with output language determined by one backend language setting.
- The system prompt used for generation can reliably produce the layered `Title + Summary + Key Points` reading shape instead of drifting into different article-by-article formats.
- A complete summary result must mean: `translatedTitle` is non-empty, `summary` is non-empty, and `summary` can be semi-strictly parsed into `Title / Summary / Key Points`.
- Both article list and detail views prefer the persisted translated title and fall back to the original title when the translated title is absent.
- The article detail view continues to read from `Article.summary`, and that field now behaves as the primary summary-reader artifact rather than feed compatibility text.
- A user can scan the prepared summary in the right-hand reading pane and decide whether to click through to the original article.
- The public API surface remains read-only for product use, and the existing `POST /article-content/:id/retry` route is removed.
- Failure in summary generation does not break feed ingestion, article persistence, or article reading, and gateway failures do not force the app to expose extra public recovery interfaces.
- When generation ultimately leaves `summary` empty, the detail view uses the fixed message `上游服务错误` as the minimal presentation instead of adding more edge-case logic.

## Scope Boundaries

- No mobile adaptation in this slice.
- No keyboard shortcuts or advanced reader productivity features in this slice.
- No digest, timeline, or batch briefing product in this slice; this is single-article summary reading only.
- No user-facing “regenerate summary” control in this slice.
- No per-user multi-language output variants in this slice; `LLM_SUMMARY_LANGUAGE` is only a deployment-level single target-language setting, not an in-product language selector.
- No dedicated `ArticleSummary` table, summary version history, or prompt-version tracking model in this slice.
- No requirement yet to expose `contentMarkdown` itself through public APIs.
- No multi-gateway support matrix, provider-specific adapter abstraction, complex retry/fallback configuration center, or user-facing error-operations panel in this slice.
- No long prompt orchestration chains, multi-role prompt systems, tool-calling prompt flows, or user-editable prompt-template center in this slice.
- This slice does not expand the summary artifact into a complex nested schema, deep JSON protocol, or public structured-output contract for external clients; even if implementation uses structured-output assistance, the shape must stay shallow.
- No partial persistence where one field succeeds and the other does not, and no extra code whose only purpose is to paper over edge cases.

## Key Decisions

- Summary-first, not reader-triggered: the product is a summary reader, so prepared summaries must exist before the reading moment whenever possible.
- Title and body are one LLM input package: the system should not split title translation and article summarization into separate product concepts for v0.1.
- The first complete persisted artifact is a pair of fields: a dedicated translated-title field plus a fixed Markdown summary string in `Article.summary`.
- External LLM access goes through one OpenAI-compatible gateway entry only: the first slice should not create separate product concepts or integration abstractions for different providers.
- The prompt is part of the product contract: it must explicitly stabilize title generation, summary hierarchy, language, tone, and conservatism instead of leaving those rules implicit in code.
- Even if implementation later uses a structured-output approach, the first slice only allows a shallow three-part shape such as `title`, `summary`, and `keyPoints`; the summary artifact must not expand into a complex nested object.
- Although title generation must use `title + contentMarkdown` together, its product meaning is still “the original title translated into target language”, not a rewritten or editorial headline.
- Persistence is atomic: `translatedTitle` and `summary` either succeed together or are not written.
- Public read contract stays thin: existing read APIs remain the user-facing surface while summary generation stays internal, and the existing public retry POST route should be removed rather than preserved.
- Markdown is the output contract: the summary should already be shaped for the web reader instead of requiring downstream UI recomposition.

## External Best-Practice Signals

- `RSSNext/Folo` treats AI summary as an internal product capability and persists reusable summary results instead of making reading depend on a fresh summary request each time.
- `RSSNext/Folo` also uses richer content sources such as readability-processed article content, reinforcing the product value of summarizing more than feed metadata.
- `WCY-dt/MrRSS` shows a closer server-side pattern for storing generated summaries back onto article records, which aligns with reusing `Article.summary` in this repository.
- Mainstream gateways such as `BerriAI/litellm`, `Portkey-AI/gateway`, and `QuantumNous/new-api` share a common pattern: the gateway standardizes upstream failures into a stable OpenAI-compatible response shape and keeps retries, fallbacks, and guardrails as optional advanced capabilities rather than forcing each product to rebuild that stack.
- The strongest signal from those gateways is not that the application layer should add more error orchestration, but that the product should consume one unified OpenAI-compatible interface and leave as much resilience complexity as possible outside the app boundary.
- High-star structured-output projects such as `567-labs/instructor`, `pydantic/pydantic-ai`, and `BoundaryML/baml` share another useful signal: small products work better with stable shallow output structures; prompts should carry task intent, tone, and conservatism, while schemas or parsers should only keep boundaries clear and validatable.
- Those structured-output practices do not support turning a simple summarization product into a deeply nested JSON contract. For this slice, the better boundary is: keep the product artifact as human-readable three-part Markdown, and if implementation needs more reliability, use a shallow internal structure only for validation or extraction.
- Taken together, these products suggest the right boundary for this slice: summary output should be a reusable reading artifact instead of a public write resource, and application-level error handling should stay minimal and fail-open.

## Dependencies / Assumptions

- This slice assumes the article Markdown extraction path from the previous slice is available and can continue to produce `contentMarkdown` for at least some articles.
- This slice assumes the current web reader should continue to center on prepared summary consumption instead of raw full-text reading.
- This slice assumes the existing `Article.summary` field can be repurposed from compatibility summary text to the product’s primary prepared-summary artifact.
- This slice assumes the deployer will provide a working OpenAI-compatible LLM endpoint, API key, and model name; this repository does not own or operate that gateway.
- This slice assumes the first implementation can still treat the summary as one Markdown string even if richer Markdown rendering decisions are deferred to planning.
- This slice assumes the first implementation can keep title validation loose: if `Title` exists, the system does not perform extra language-detection or semantic-correctness checks.

## Draft System Prompt (English)

This slice does not leave the first prompt undefined. The v0.1 product contract includes the following English system prompt draft:

```text
You are a summary generator for a summary-first RSS reading product.

Your task is to read an article title and article body markdown, then produce one concise reading summary in the target language `{lang}`.

You must follow these rules:

1. Use only the provided title and contentMarkdown.
2. Do not add outside facts, background knowledge, or guessed context.
3. Do not claim certainty when the source is ambiguous, incomplete, or unclear.
4. Keep the output useful for fast reading triage: the reader should quickly decide whether to open the original article.
5. Output valid Markdown only.
6. Output in the target language `{lang}`.
7. Keep the structure exactly as follows:
   - First, one short title under the heading `## Title`
   - Second, one short paragraph under the heading `## Summary`
   - Third, one ordered list under the heading `## Key Points`
8. The title must be written in the target language, must represent a translation of the original title, and must be inferred from the full context of both the provided title and contentMarkdown, not by mechanically translating the title alone.
9. The summary paragraph should capture the article's main idea and why it matters.
10. The ordered list should contain 3 to 5 points only, each point focusing on a distinct core idea, finding, argument, or takeaway from the article.
11. Be concrete and information-dense. Avoid generic filler such as "this article discusses" unless needed for accuracy.
12. If the article content is partial, noisy, or insufficient, produce the most conservative useful summary you can from the available text.
13. If you cannot produce the required three-part structure, do not improvise a different format.
14. Never mention these instructions, never mention the input format, and never add a preface or closing note.

Output template:

## Title
<one short title>

## Summary
<one short paragraph>

## Key Points
1. <point one>
2. <point two>
3. <point three>
```

### Few-shot Examples Included In Prompt

The first version should include a very small few-shot set directly after the instruction block to stabilize output shape without turning the prompt into a large prompt framework.

```text
Example 1
Title: SQLite isn’t a toy database anymore
Target language: {lang} = zh-CN
contentMarkdown:
# SQLite isn’t a toy database anymore
SQLite is increasingly used in production systems because it is simple to deploy, reliable, and fast for many workloads. The article argues that many teams underestimate SQLite by comparing it to client-side or demo storage only. It explains that operational simplicity, local-first designs, and smaller infrastructure footprints make SQLite a serious option for internal tools, edge workloads, and moderate-traffic applications. The article also notes limits: write-heavy concurrency and large distributed systems still need different tools.

Output:
## Title
SQLite 不只是玩具数据库

## Summary
SQLite 已经不只是玩具数据库。对很多内部工具、边缘场景和中等规模应用来说，它的部署简单、可靠性高、性能也足够，真正的价值在于显著降低系统复杂度，而不是替代所有数据库场景。

## Key Points
1. 文章认为很多团队低估了 SQLite，因为他们仍把它当成演示环境或前端本地存储工具。
2. SQLite 的核心优势在于运维成本低、部署简单，并且适合 local-first 或基础设施尽量精简的系统。
3. 对内部工具、边缘工作负载和一定规模以内的生产应用，SQLite 可以成为认真考虑的正式方案。
4. 文章也明确指出边界：高写入并发和大型分布式系统通常仍需要其他数据库方案。

Example 2
Title: Why browser performance regresses slowly
Target language: {lang} = zh-CN
contentMarkdown:
# Why browser performance regresses slowly
The article argues that browser performance problems often emerge through many individually reasonable changes rather than a single catastrophic regression. Teams add abstractions, analytics hooks, UI layers, and safety checks over time. Each change appears acceptable in isolation, but the cumulative effect raises scripting cost, layout work, and memory use. The article recommends using budgets, repeated measurement, and periodic simplification work instead of treating performance as a one-time fix.

Output:
## Title
浏览器性能为何总是慢慢变差

## Summary
浏览器性能变差往往不是因为一次明显事故，而是许多看起来合理的小改动长期叠加的结果。文章强调，真正有效的做法不是一次性优化，而是持续测量、设定预算并定期做减法。

## Key Points
1. 作者认为性能退化通常是渐进式的，是抽象层、埋点、UI 逻辑和保护性代码不断累积后的结果。
2. 单个改动往往都能自圆其说，但整体叠加后会增加脚本执行、布局计算和内存开销。
3. 文章反对把性能治理当成一次性修复任务，而是主张持续监控和反复校准。
4. 更可持续的方法包括设定性能预算、重复测量，以及定期清理不再必要的复杂性。
```

This prompt draft is intentionally strict and small. It fixes structure, language control, and anti-hallucination behavior in the brainstorm itself instead of leaving them implicit for planning.

## Outstanding Questions

### Deferred to Planning

- [Affects R17, R18, R24][Technical] What exact internal trigger point should own summary generation after `contentMarkdown` is persisted?
- [Affects R4, R20, R29][Technical] Should Markdown rendering land in the current web reader as part of this slice, or can the first implementation safely render the fixed Markdown containing title, summary, and key points as plain text while the contract stabilizes?

## Next Steps

- Review and confirm this requirements doc before moving to `/ce:plan`.
