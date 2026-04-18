---
title: Retryable article summary failures must not clear an existing prepared summary before retries are exhausted
date: 2026-04-18
category: logic-errors
module: article summary
problem_type: logic_error
component: background_job
symptoms:
  - a retryable `title_changed` summary refresh could replace a readable prepared summary with an error/pending state after the first transient gateway failure
  - `summaryErrorReason` could be persisted while more retries were still scheduled, making transient failures look terminal to the reader
  - unit coverage allowed retryable failures to persist too early until the refresh path was tested explicitly
root_cause: logic_error
resolution_type: code_fix
severity: high
related_components:
  - nest_service
  - api_contract
tags:
  [
    article-summary,
    retry,
    fail-open,
    title-changed,
    llm,
    background-job,
    summaryerrorreason,
  ]
---

# Retryable article summary failures must not clear an existing prepared summary before retries are exhausted

## Problem

The LLM summary pipeline intentionally retries transient provider failures, but the first implementation persisted failure state on every retryable failure. For `title_changed` refresh jobs, that meant a previously usable summary could disappear from the reader after one temporary gateway timeout even though the job still had retries left.

## Symptoms

- An article that already had `summary` and `translatedTitle` could temporarily fall back to `summaryErrorReason` or `Summary pending` after a retryable refresh failure.
- The summary service logged the failure and persisted `summaryErrorReason` on attempt 1, even though attempts 2 and 3 were still scheduled.
- Review and handoff notes identified this as a P1 fail-open regression in the new `article-summary` slice.

## What Didn't Work

- Persisting failure state immediately for every `retryable_failed` result looked consistent with terminal failure handling, but it broke the fail-open contract for enrichment jobs.
- Changing repository semantics first would have been a larger fix than necessary; the actual bug was the service calling `saveSummaryFailure()` before checking whether retries remained.
- Existing tests covered retry exhaustion, but not the stronger requirement that intermediate retryable failures must not change persisted reader-visible state.

## Solution

Move failure persistence behind the final-attempt check in `ArticleSummaryService.runJob()`. Retryable failures now stay in memory until the third attempt fails; only then does the service persist `summaryErrorReason` and clear prepared summary fields.

Before:

```ts
if (result.status === "retryable_failed") {
  await this.persistFailureState(job, result.reason, true);

  if (job.attempt >= ARTICLE_SUMMARY_MAX_ATTEMPTS) {
    this.trackedArticleIds.delete(job.articleId);
    return;
  }

  setTimeout(() => {
    this.queue.push({
      ...job,
      attempt: job.attempt + 1,
    });
    this.drainQueue();
  }, ARTICLE_SUMMARY_RETRY_DELAY_MS);

  return;
}
```

After:

```ts
if (result.status === "retryable_failed") {
  if (job.attempt >= ARTICLE_SUMMARY_MAX_ATTEMPTS) {
    await this.persistFailureState(job, result.reason, true);
    this.trackedArticleIds.delete(job.articleId);
    return;
  }

  this.logger.warn(
    JSON.stringify({
      articleId: job.articleId,
      attempt: job.attempt,
      reason: result.reason,
      retryable: true,
      scope: "article_summary",
      status: "scheduled_retry",
      trigger: job.reason,
    }),
  );

  setTimeout(() => {
    this.queue.push({
      ...job,
      attempt: job.attempt + 1,
    });
    this.drainQueue();
  }, ARTICLE_SUMMARY_RETRY_DELAY_MS);

  return;
}
```

The fix is locked in with targeted tests that assert no persistence on attempts 1 and 2, plus explicit coverage for the `title_changed` refresh path:

```ts
service.schedule("article-1", "title_changed");
await flushJobs();
expect(repository.saveSummaryFailure).not.toHaveBeenCalled();

await jest.advanceTimersByTimeAsync(60_000);
expect(repository.saveSummaryFailure).not.toHaveBeenCalled();

await jest.advanceTimersByTimeAsync(60_000);
expect(repository.saveSummaryFailure).toHaveBeenCalledTimes(1);
```

## Why This Works

`ArticleSummaryRepository.saveSummaryFailure()` clears both `summary` and `translatedTitle` when it persists `summaryErrorReason`. That write is correct only when the system has decided the job is terminally failed. By delaying the write until retries are exhausted, the system preserves the last known good reader content during transient failures while still surfacing a durable failure reason if the final attempt also fails.

This restores the intended fail-open behavior for background enrichment:

- temporary provider failures do not immediately degrade reader-visible content
- retry scheduling remains observable through logs
- terminal failure semantics stay unchanged

## Prevention

- Add tests for both intermediate and exhausted retry paths whenever a background job writes user-visible fallback state.
- Treat repository methods that clear successful data as state-transition boundaries; callers should invoke them only after a final decision, not during speculative retries.
- When a refresh path updates already-published data, preserve stale-but-usable content until replacement succeeds or the retry policy is exhausted.
- Keep plan docs aligned with the shipped fallback contract so reviewers can compare behavior against the right fail-open expectation.

## Related Issues

- Related, moderate overlap: `docs/en/solutions/integration-issues/feed-ingestion-retries-missing-article-markdown-2026-04-17.md` + `docs/zh-Hans/solutions/integration-issues/feed-ingestion-retries-missing-article-markdown-2026-04-17.md` — same fail-open ingestion/enrichment area, different root cause and different recovery path
- Related context: `.claude/handoffs/2026-04-18-215811-llm-summary-reader-p1-fix.md`
- Related review context: `.claude/handoffs/2026-04-18-221336-review-llm-summary-reader.md`
- Plan context: `docs/en/plans/2026-04-18-001-feat-v0-1-llm-summary-reader-plan.md` + `docs/zh-Hans/plans/2026-04-18-001-feat-v0-1-llm-summary-reader-plan.md`
- GitHub issue search skipped: `gh issue list` returned `401 Unauthorized`
