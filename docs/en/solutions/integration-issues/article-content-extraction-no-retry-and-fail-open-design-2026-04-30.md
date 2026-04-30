---
title: Article content extraction has no HTTP retry and uses fail-open summary scheduling
date: 2026-04-30
category: integration-issues
module: apps/api article-content
problem_type: integration
component: article_content_extraction
severity: medium
applies_when:
  - reviewing ArticleContentModule architecture
  - assessing retry behavior for external HTTP fetches in article extraction
  - evaluating error handling boundaries between content and summary pipelines
  - considering idempotency guarantees of tryPersistArticleContent
tags:
  [
    apps-api,
    article-content,
    retry,
    error-handling,
    fail-open,
    idempotency,
    architectural-review,
  ]
---

# Article content extraction has no HTTP retry and uses fail-open summary scheduling

## Context

`ArticleContentService.tryPersistArticleContent` orchestrates the article content
extraction pipeline: fetch HTML from original URL, extract readable content via
Readability + Turndown, persist Markdown to DB, and schedule summary generation.

Key architectural observations from review:

1. **No HTTP retry**: `fetchArticleHtml` makes a single `fetch()` call with
   `AbortController` timeout. On network error, timeout, or non-200 status, the
   method throws immediately — no retry loop, no backoff, no fallback.
2. **Fail-open summary scheduling**: After content is persisted, summary scheduling
   (`articleSummaryService.schedule`) failures are caught and logged but do not
   roll back the persisted content. This is intentional — content extraction is
   expensive (HTTP + DOM parsing), summary can be retried later.
3. **Implicit retry via idempotency**: Failed extractions leave `contentMarkdown`
   as null in DB. Next feed ingestion cycle calls `tryPersistArticleContent` again
   for the same article, effectively retrying. No immediate retry, but eventual
   retry on next ingestion trigger.

## Pattern

**Current design trade-offs:**

| Concern                    | Current behavior                     | Trade-off                                                       |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| HTTP retry                 | None — single fetch                  | Simple; prevents blocking other articles in batch               |
| Summary scheduling failure | Caught, logged, content kept         | Content extraction is expensive; summary is cheap and retriable |
| Retry on failure           | Implicit via next ingestion cycle    | Delayed but guaranteed if feed keeps updating                   |
| Timeout budget             | Caller-passed, clamped to [1ms, 10s] | Prevents runaway fetches; prevents zero/negative timeout        |

**Do:**

- Accept that single-fetch is correct for this ingestion model — articles are
  processed in a batch loop (`FeedIngestionService.enrichArticles`), and retrying
  one article blocks the rest.
- Rely on idempotency: `contentMarkdown === null` check ensures failed extractions
  are retried on next ingestion cycle.
- Keep fail-open for summary scheduling — content persistence is the expensive
  operation, summary is downstream and retriable.

**Don't:**

- Add retry loops inside `tryPersistArticleContent` without considering batch
  throughput — one slow retry blocks all remaining articles.
- Roll back content persistence when summary scheduling fails — this wastes the
  already-completed expensive extraction.
- Treat `status: "failed"` as terminal — it means "not this cycle," not "never."

## Relevant code

```ts
// Single-fetch with timeout — no retry
private async fetchArticleHtml(originalUrl: string, timeoutMs = ARTICLE_FETCH_TIMEOUT_MS) {
  const effectiveTimeoutMs = Math.max(1, Math.min(timeoutMs, ARTICLE_FETCH_TIMEOUT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  try {
    const response = await fetch(originalUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`Article request failed with status ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

// Fail-open: summary scheduling failure does not affect succeeded status
try {
  this.articleSummaryService.schedule(articleId, "content_persisted");
} catch (error) {
  this.logger.warn(...); // log and continue — content already persisted
}
```

## Why this matters

- Understanding the retry model prevents false assumptions — `failed` does not
  mean the article is permanently lost, it means extraction will be attempted again
  on next feed ingestion.
- Fail-open summary scheduling is a deliberate architectural boundary: content and
  summary are separate concerns with different cost profiles.
- Batch processing model means retry must be deferred, not inline — this is a
  conscious design choice, not an oversight.
