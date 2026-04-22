---
date: 2026-04-22
topic: llm-error-sanitization-and-diagnostics
---

# LLM Error Sanitization and Diagnostic Feedback Requirements

## Problem Frame

The repository currently contains a verified error-leak chain: `apps/api/src/article-summary/article-summary.gateway.ts` reads upstream provider / gateway `error.message` directly, `apps/api/src/article-summary/article-summary.repository.ts` persists that value into `summaryErrorReason`, `apps/api/src/articles/articles.service.ts` returns it to the web client, and `apps/web/src/widgets/article-reader/ui/article-detail.tsx` renders it directly to the user.

That means any upstream error text containing API keys, bearer tokens, header fragments, proxy configuration, or other sensitive diagnostics can leak into the database, backend logs, and frontend UI at the same time. This is no longer only a copy-quality problem; it is a security and operability boundary issue that needs immediate containment.

This requirement set chooses option 3: do not patch around the problem only in the frontend, and do not only rewrite copy at the API boundary. Instead, establish a stable, safe error contract at the source and keep raw provider errors outside the application contract. The frontend should consume safe, copyable, user-facing error feedback that helps troubleshooting without leaking secrets. Backend logs should keep enough structured diagnostic context for developers and operators.

Verified current-state context:

- `apps/api/src/article-summary/article-summary.gateway.ts` returns raw `error.message` through `getErrorReason()`.
- `apps/api/src/article-summary/article-summary.service.ts` writes failed `reason` values into structured logs, but the current log payload can still contain upstream sensitive text.
- `apps/api/src/article-summary/article-summary.repository.ts` persists failed `reason` values into `Article.summaryErrorReason` and clears `summary` and `translatedTitle`.
- `apps/api/src/articles/article.repository.ts` / `apps/api/src/articles/articles.service.ts` / `apps/api/src/articles/dto/article-detail-item.dto.ts` continue exposing `summaryErrorReason` through the read API.
- `apps/web/src/widgets/article-reader/api/articles-api.ts` and `apps/web/src/widgets/article-reader/ui/article-detail.tsx` already treat `summaryErrorReason` as user-facing display copy.

## Design Steps

### Step 1: Capabilities

1. The system must prevent raw LLM provider / gateway error text from reaching user-visible UI.
2. The system must prevent raw upstream error text from being persisted into long-lived business fields.
3. The system must provide safe, stable, copyable user-facing error feedback that is sufficient for self-service troubleshooting or escalation to a maintainer.
4. The system must preserve better structured backend diagnostics so developers and operators can identify error class, retryability, trigger context, and affected objects.
5. The system must stabilize error semantics so the frontend, database, and logs no longer depend on provider free-form text.
6. The system must preserve the current fail-open product direction: summary failure must not break the article-reading path.

### Step 2: Components

- `LLM Error Normalizer`: lives at the upstream LLM call boundary and collapses raw provider / gateway failures into stable error codes, categories, and safe user-facing messages.
- `Summary Failure Persistence Model`: defines which failure information is allowed into durable business fields such as `summaryErrorReason` and which data must stay only in diagnostic logs.
- `Structured Diagnostic Logger`: records article, attempt, retryable, httpStatus, provider, errorCode, and related troubleshooting fields without logging raw secret-bearing provider text.
- `Article Read Contract`: exposes safe error information instead of raw provider messages to the web read path.
- `Frontend Error Presentation`: renders safe failure feedback as a copyable error block containing a stable error code, short explanation, and suggested next action.

### Step 3: Interactions

**Flow A — LLM summary call fails**

1. `ArticleSummaryGateway` calls the external LLM provider / gateway.
2. On failure, `LLM Error Normalizer` reads only classifiable signals from the exception object, such as `status`, exception name, error type, or SDK-structured fields.
3. The normalizer produces one unified failure result: error code, retryability, safe user-facing message, and limited diagnostic metadata for logs.
4. `ArticleSummaryService` decides retry vs terminal behavior from the unified result instead of reading raw `error.message` again.

**Flow B — Failure persistence and logging**

1. Terminal failure enters the `Summary Failure Persistence Model`.
2. Durable fields only store stable safe values, such as an error code or safe error summary, never raw provider text.
3. `Structured Diagnostic Logger` records unified error code, HTTP status, retryable, articleId, attempt, trigger, and related safe metadata.
4. Log output must be designed for search, aggregation, and alerting rather than concatenated provider free-form text.

**Flow C — Frontend read and presentation**

1. `Article Read Contract` returns safe error fields to the web client.
2. `Frontend Error Presentation` renders a fixed error block: human-readable title, copyable error code, and short recovery guidance.
3. When the user copies the block, the result must not contain API keys, tokens, authorization headers, or raw upstream payload text.

### Step 4: Contracts

**Unified failure-result contract**

- Must contain a stable error code such as `LLM_AUTH_FAILED`, `LLM_RATE_LIMITED`, `LLM_TIMEOUT`, `LLM_CONNECTION_FAILED`, `LLM_BAD_RESPONSE`, `LLM_PROVIDER_FAILED`, or `LLM_CONFIG_UNAVAILABLE`.
- Must express retryability so the summary worker can decide whether to retry.
- Must contain a safe user-facing message.
- May contain restricted diagnostic fields for logs, such as `httpStatus`, `providerKind`, or `sdkErrorName`, but these fields must not flow directly into frontend copy.

**Persistence contract**

- `summaryErrorReason` must stop behaving as a slot for raw provider text.
- In the first version it may store only a stable error code, or a shallow safe value such as `error code + safe copy`, but it must not continue as raw-message storage.
- If the current persistence contract is insufficient for frontend needs, planning may decide whether to introduce a more explicit safe error field. This brainstorm locks only the boundary that raw provider text cannot be persisted into user-facing business data.

**Frontend presentation contract**

- Frontend error UI must be driven by structured safe fields instead of assuming one backend string is safe to print verbatim.
- The error block must contain at least: user-visible title, stable error code, short explanation, and suggested action.
- Copy output must remain useful for support and issue filing while staying secret-safe, for example `LLM_AUTH_FAILED | article=<id>` or similar safe text.

## Requirements

**Security Boundary**

- R1. The system must not expose raw error text from external LLM providers / gateways directly to frontend users.
- R2. The system must not persist raw external provider / gateway error text into `Article.summaryErrorReason` or any other business read field.
- R3. The system must not concatenate raw provider failures that may contain secrets into normal application logs.
- R4. Any error content containing API keys, tokens, authorization headers, signature fragments, or vendor request details must be intercepted or discarded before entering business contracts.

**Error Contract**

- R5. LLM summary failures must be normalized into stable error codes at the call boundary instead of depending on provider free-form text.
- R6. The normalized result must explicitly encode retryability.
- R7. The first error-code set must cover the most common user-facing troubleshooting cases: auth failure, rate limiting, timeout, connection failure, bad response, missing configuration, and unknown upstream failure.
- R8. Frontend and backend must share one stable error semantic layer so the backend does not write one meaning while the frontend guesses another.

**Logging and Observability**

- R9. The backend must emit structured logs instead of only concatenated failure strings.
- R10. LLM-related failure logs must include at least: `scope`, `status`, `errorCode`, `retryable`, `articleId`, `attempt`, and `trigger`; when safely available they should also include `httpStatus` and provider category.
- R11. Log design must prioritize searchability, aggregation, and future alerting rather than mirroring user-facing copy.
- R12. The first version does not require a full jobs console or ops dashboard; logs remain the main diagnostic surface.

**Frontend Feedback**

- R13. The frontend must render summary failures as fixed, safe, copyable error blocks instead of raw backend strings.
- R14. The error block must tell the user what class of failure occurred and what to check next without exposing provider internals.
- R15. Copyable content must remain stable and concise so users can paste it to a maintainer, issue tracker, or their own config checklist.
- R16. Failure presentation must preserve the current summary-reader layout and comprehension rather than disrupting the article detail experience.

**Scope and Evolution**

- R17. This fix must cover at minimum the confirmed leak path `article-summary -> article read API -> web detail pane`.
- R18. This fix should establish a reusable pattern that later LLM or external-integration error paths can follow.
- R19. This fix does not need to clean up every `error.message` usage across the repo in one pass, but the new contract must not encourage continued copy-paste of the old pattern.
- R20. This fix must preserve the current summary retry / fail-open behavior and must not introduce product regressions while tightening safety.

## Success Criteria

- When upstream LLM auth failures or gateway failures occur, the frontend no longer shows raw provider error text.
- `summaryErrorReason` no longer stores raw provider messages and instead stores only safe values.
- Backend logs let developers distinguish major failure types such as `LLM_AUTH_FAILED`, `LLM_RATE_LIMITED`, and `LLM_TIMEOUT`, and correlate them with specific `articleId` values and attempt counts.
- The user-facing error message can be copied and pasted to a maintainer, but the copied text contains no secrets.
- Existing article reads and fail-open summary behavior remain intact; safety tightening does not break the reading path.

## Scope Boundaries

- This work does not redesign the entire global exception system.
- This work does not introduce a user-facing jobs dashboard, error history center, or operations console.
- This work does not require one-pass cleanup of every raw `error.message` usage in modules such as `feeds` or `article-content`.
- This work does not introduce a provider-specific adapter layer; the thin OpenAI-compatible call boundary remains.
- This work does not expose deeper provider request / response details to the frontend.

## Key Decisions

- Solution choice: use source normalization + structured logs + safe frontend error blocks instead of frontend masking or API-edge-only copy rewrites.
- Security priority: raw provider error text is treated as untrusted input and kept out of durable business data and user UI by default.
- Error-code first: product behavior and troubleshooting should revolve around stable error codes rather than vendor free-form text.
- Log layering: logs keep diagnostic value but must not become a dumping ground for secrets.
- Frontend goal: provide enough copyable troubleshooting value without providing “detailed” raw provider text.

## Dependencies / Assumptions

- `apps/api/src/article-summary/article-summary.gateway.ts` remains the best normalization entry point because it already sits at the external LLM boundary.
- `summaryErrorReason` is already consumed by the web read path, so whether the implementation keeps that field or evolves to a new one, the read contract must remain migratable.
- The upstream SDK or exception object provides at least some classifiable signals such as `status`, `name`, `type`, or related structured fields; if not, the first version may safely fall back to `LLM_PROVIDER_FAILED`.

## Outstanding Questions

### Deferred to Planning

- [Affects R2, R13, R15][Technical] In the first version, should `summaryErrorReason` store only an error code, or a more structured safe presentation value?
- [Affects R10, R11][Technical] Should logs gain a dedicated request correlation id in this change, or should the first version reuse the current log context?
- [Affects R18, R19][Needs research] Should this implementation extract a reusable external-error normalization helper now, or first scope it only to `article-summary`?

## Next Steps

- Confirm this requirements / design document, then proceed to `/ce:plan` or `/ce:work`.
