---
title: Feed ingestion must retry article markdown enrichment for existing rows that still have no content
date: 2026-04-17
category: integration-issues
module: feed ingestion
problem_type: integration_issue
component: nest_service
symptoms:
  - repeated ingestion runs updated article metadata but left `contentMarkdown` null on the same row
  - recovery depended on the secondary retry endpoint instead of the normal ingestion path
  - unit coverage allowed a regression where only newly created rows were sent to article-content enrichment
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - typeorm_repository
tags:
  [
    feed-ingestion,
    article-content,
    markdown,
    retry,
    contentmarkdown,
    fail-open,
    nestjs,
  ]
---

# Feed ingestion must retry article markdown enrichment for existing rows that still have no content

## Problem

The article markdown slice is supposed to enrich article bodies automatically during normal feed ingestion while keeping ingestion fail-open. That contract regressed: if the first extraction attempt failed, later ingestion runs updated the existing article row but did not re-enqueue it for markdown extraction, so `contentMarkdown` stayed null indefinitely unless an operator manually called the retry endpoint.

## Symptoms

- The first ingestion run could persist article metadata successfully while leaving `contentMarkdown` and `contentExtractedAt` null after an HTML fetch/extraction failure.
- A later ingestion of the same feed kept the same article row and refreshed metadata, but still did not recover missing markdown automatically.
- The dedicated retry endpoint worked, which made the bug easy to misread as an acceptable “manual repair only” path instead of a broken primary path.

## What Didn't Work

- Treating article-content enrichment as “new rows only” looked safe, but it silently broke the recovery path for historical rows that were already discovered before extraction succeeded.
- Relying on the single-article retry endpoint was not enough, because the plan for this slice explicitly defined retry as a secondary repair path, not the main ingestion contract.
- A unit test had effectively locked in the wrong behavior, so the regression could pass review until an end-to-end recovery scenario was tested.

## Solution

Restore enqueueing inside `FeedIngestionService.persistNormalizedArticles()` for existing rows whose markdown is still missing, while continuing to skip rows that already have extracted content.

Before:

```ts
if (existing) {
  await tx.article.update({
    where: { id: existing.id },
    data: {
      title: article.title,
      originalUrl: article.originalUrl,
      publishedAt: article.publishedAt,
      summary: article.summary,
      ingestedAt: article.ingestedAt,
      sourceId: existing.sourceId ?? article.sourceId,
    },
  });
  continue;
}
```

After:

```ts
if (existing) {
  await tx.article.update({
    where: { id: existing.id },
    data: {
      title: article.title,
      originalUrl: article.originalUrl,
      publishedAt: article.publishedAt,
      summary: article.summary,
      ingestedAt: article.ingestedAt,
      sourceId: existing.sourceId ?? article.sourceId,
    },
  });

  if (!existing.contentMarkdown) {
    articleIds.push(existing.id);
  }

  continue;
}
```

Two regression guards were added around that orchestration rule:

1. A unit test in `apps/api/src/feeds/feed-ingestion.service.spec.ts` now asserts that an existing article with `contentMarkdown: null` is sent back through `tryPersistArticleContent(...)`.
2. An end-to-end test in `apps/api/e2e/feed-ingestion.e2e-spec.ts` now proves the full recovery flow: the first run fails open, the second run keeps the same article row, and markdown is persisted automatically on that later ingestion.

The downstream idempotency contract remains unchanged in `ArticleContentService`:

```ts
if (article.contentMarkdown && !options?.force) {
  return {
    reason: "already_extracted",
    status: "skipped",
  };
}
```

That guard keeps the restored enqueue behavior safe for rows that already have body content.

## Why This Works

The bug lived at the integration boundary between feed metadata persistence and article-content enrichment. The ingestion pipeline already knew how to:

- keep article identity stable across runs,
- update metadata on existing rows, and
- avoid duplicate extraction when content already exists.

What it stopped doing was reconnecting those existing-but-incomplete rows to the enrichment step. Re-queueing only rows with missing `contentMarkdown` restores the intended automatic recovery path without turning every repeated ingestion into redundant extraction work. The `ArticleContentService` idempotency check remains the second safety net, so already-enriched rows still short-circuit cleanly.

## Prevention

- Add orchestration tests for both branches of “existing row”: one with `contentMarkdown: null`, one with existing markdown already present.
- Keep an e2e scenario that spans at least two ingestion runs, because this regression only appears when the first run fails open and the second run tries to recover.
- Treat repair endpoints as secondary workflows in tests and docs; if the main ingestion contract says enrichment is automatic, assert that behavior directly.
- When `findFirst()` results are used to decide downstream work, include every field needed for orchestration decisions. Here, `existing.contentMarkdown` is part of the contract and should not be removed casually from the query/result shape.

## Related Issues

- `apps/api/src/feeds/feed-ingestion.service.ts`
- `apps/api/src/feeds/feed-ingestion.service.spec.ts`
- `apps/api/e2e/feed-ingestion.e2e-spec.ts`
- `apps/api/src/article-content/article-content.service.ts`
- `apps/api/e2e/article-content-retry.e2e-spec.ts`
- `docs/en/plans/2026-04-17-001-feat-article-markdown-backfill-plan.md`
- `docs/zh-Hans/plans/2026-04-17-001-feat-article-markdown-backfill-plan.md`
- `.claude/handoffs/2026-04-17-164836-feed-ingestion-auto-enrichment-recovery.md`
- `.claude/handoffs/2026-04-17-170512-article-markdown-backfill-review-fix.md`
