---
title: Wake-triggered feed auto-refresh must reuse the canonical ingestion pipeline and durable success state
date: 2026-04-20
category: integration-issues
module: feed auto refresh
problem_type: integration_issue
component: nest_service
symptoms:
  - a same-process wake after sleep could leave feed data stale because `INGEST_ON_BOOT` only covered cold startup
  - the API had no durable global timestamp for the last successful wake-driven refresh, so elapsed-interval gating had nowhere authoritative to read from
  - any wake-refresh implementation that bypassed `FeedIngestionService` risked drifting away from the existing article-content and summary pipeline
root_cause: missing_workflow_step
resolution_type: code_fix
severity: medium
related_components:
  - background_job
  - typeorm_repository
  - typeorm_migration
tags:
  [
    feed-auto-refresh,
    wake-resume,
    feed-ingestion,
    bootstrap,
    prisma,
    summary-pipeline,
    nestjs,
  ]
---

# Wake-triggered feed auto-refresh must reuse the canonical ingestion pipeline and durable success state

## Problem

`apps/api` could ingest feeds during bootstrap, but it still behaved like a startup-only path. When the same Node process resumed after machine sleep or runtime freeze, feeds could stay stale even though the app was alive again, and there was no durable global success timestamp to decide whether a background catch-up refresh was overdue.

The fix had to stay non-blocking for HTTP startup, preserve the existing meaning of `INGEST_ON_BOOT`, and keep newly discovered articles flowing into the existing article-content and LLM summary chain instead of inventing a second ingestion path.

## Symptoms

- Same-process wake/resume had no dedicated refresh trigger, so freshness depended on a later cold restart or manual intervention.
- There was no single persisted `lastSuccessfulAutoRefreshAt` source of truth for interval checks; storing it on `Feed` rows would have turned a global decision into ambiguous per-feed state.
- The existing ingestion path already owned persistence, Markdown enrichment, and summary scheduling, so a parallel wake-refresh loop would have been likely to diverge from the main contract immediately.

## What Didn't Work

- Reusing `INGEST_ON_BOOT` as the wake-refresh switch would have mixed two different semantics: unconditional bootstrap ingestion versus elapsed-interval refresh after same-process resume.
- Putting wake-refresh eligibility on request paths was rejected because the requirements explicitly kept feed/network work out of read traffic.
- Treating the last successful wake refresh as per-feed state did not fit the product rule. This slice needed one global timestamp, not a fan-out of duplicated values on `Feed`.

## Solution

The implementation landed three linked changes inside `apps/api`.

1. Add a dedicated durable singleton state model plus a defaulted interval config:

```prisma
model FeedAutoRefreshState {
  id                          String   @id
  lastSuccessfulAutoRefreshAt DateTime?
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt
}
```

```ts
const DEFAULT_FEED_AUTO_REFRESH_INTERVAL_HOURS = 6;

return {
  feedAutoRefreshIntervalHours:
    validated.FEED_AUTO_REFRESH_INTERVAL_HOURS ??
    DEFAULT_FEED_AUTO_REFRESH_INTERVAL_HOURS,
  // ...
};
```

2. Extend `FeedIngestionService` so wake-driven callers can reuse the canonical pipeline, pass trigger metadata, and receive a structured run result:

```ts
async ingestFromOpml(
  opmlPath: string,
  options: FeedIngestionOptions = {},
): Promise<FeedIngestionRunResult> {
  const trigger = options.trigger ?? "bootstrap";
  const maxAttemptsPerFeed = Math.max(1, options.maxAttemptsPerFeed ?? 1);
  // ...

  return {
    failedCount,
    status: summaryStatus,
    successCount,
    totalFeeds: subscriptions.length,
    trigger,
  };
}
```

3. Add a wake-only orchestration layer that detects a same-process resume gap, skips duplicate in-flight runs, gates by the durable interval, and only advances the success timestamp after a run finishes with at least one successful feed:

```ts
async checkHeartbeat(nowMs: number = Date.now()) {
  const gapMs = nowMs - this.lastHeartbeatAt;
  this.lastHeartbeatAt = nowMs;

  if (gapMs < RESUME_GAP_THRESHOLD_MS) {
    return;
  }

  await this.handleWakeResume(nowMs, gapMs);
}

private async handleWakeResume(nowMs: number, gapMs: number) {
  if (this.isRefreshRunning) {
    return;
  }

  const lastSuccessfulAutoRefreshAt =
    await this.repository.getLastSuccessfulAutoRefreshAt();

  if (
    lastSuccessfulAutoRefreshAt &&
    nowMs - lastSuccessfulAutoRefreshAt.getTime() < intervalMs
  ) {
    return;
  }

  const result = await this.feedIngestionService.ingestFromOpml(
    config.feedOpmlPath,
    {
      maxAttemptsPerFeed: 3,
      trigger: "auto_refresh_resume",
    },
  );

  if (result.successCount > 0) {
    await this.repository.markSuccessfulAutoRefresh(new Date(nowMs));
  }
}
```

Regression protection landed at the same time:

1. `apps/api/src/config/app-config.spec.ts` locks the default and validation rules for `FEED_AUTO_REFRESH_INTERVAL_HOURS`.
2. `apps/api/src/feeds/feed-ingestion.service.spec.ts` locks structured run results plus bounded retry behavior.
3. `apps/api/src/feeds/feed-auto-refresh.service.spec.ts` covers first-run, stale-state, fresh-state, in-flight, and full-failure timestamp semantics.
4. `apps/api/e2e/feed-auto-refresh.e2e-spec.ts` proves that wake-triggered refresh still writes through the canonical article-content path.
5. `apps/api/e2e/prisma-schema.e2e-spec.ts` proves the singleton table exists without polluting `Feed` rows.

## Why This Works

The key was to separate orchestration from ingestion ownership instead of forking the pipeline.

- `FeedAutoRefreshService` owns only wake detection, interval gating, and overlap prevention.
- `FeedIngestionService` remains the single owner of feed fetch, persistence, Markdown enrichment, and summary scheduling.
- `FeedAutoRefreshState` keeps the success timestamp global and durable, which matches the product rule and survives process restarts.
- The returned run result lets the wake layer distinguish `all_success`, `partial_success`, and `full_failure` without reinterpreting ingestion logs.
- Because the wake path calls the same ingestion backbone, new articles still enter the same downstream article-content and summary contracts as bootstrap-ingested articles.

## Prevention

- Keep bootstrap and wake semantics explicit. New callers should pass a `trigger` instead of overloading `INGEST_ON_BOOT`.
- Preserve the singleton-state boundary in tests: schema coverage should keep proving that wake-refresh state lives outside `Feed`.
- Keep both unit and e2e coverage around interval gating, in-flight dedupe, and canonical pipeline reuse; those are the fragile contracts of this slice.
- When adding retry logic to ingestion callers, keep the retry budget and retryability decision close to `FeedIngestionService` so orchestration layers do not drift into custom fetch loops.
- The final review handoff at `.claude/handoffs/2026-04-20-163932-ce-review-feed-auto-refresh.md` recorded follow-up concerns, but this branch intentionally shipped without additional code changes after that pass; future readers should treat it as review context, not as part of the implemented fix.

## Related Issues

- Moderate overlap: `docs/en/solutions/integration-issues/feed-ingestion-retries-missing-article-markdown-2026-04-17.md` + `docs/zh-Hans/solutions/integration-issues/feed-ingestion-retries-missing-article-markdown-2026-04-17.md` - same feed-ingestion recovery area and same canonical-pipeline principle, but a different root cause and a different trigger surface
- `apps/api/src/feeds/feed-auto-refresh.service.ts`
- `apps/api/src/feeds/feed-auto-refresh.repository.ts`
- `apps/api/src/feeds/feed-ingestion.service.ts`
- `apps/api/src/feeds/feed-ingestion.types.ts`
- `apps/api/prisma/models/feed-auto-refresh-state.prisma`
- `apps/api/prisma/migrations/202604200001_add_feed_auto_refresh_state/migration.sql`
- `apps/api/e2e/feed-auto-refresh.e2e-spec.ts`
- `apps/api/e2e/prisma-schema.e2e-spec.ts`
- `apps/api/README.md`
- `docs/en/brainstorms/2026-04-20-feed-auto-refresh-on-wake-requirements.md`
- `docs/zh-Hans/brainstorms/2026-04-20-feed-auto-refresh-on-wake-requirements.md`
- `docs/en/plans/2026-04-20-001-feat-feed-auto-refresh-on-wake-plan.md`
- `docs/zh-Hans/plans/2026-04-20-001-feat-feed-auto-refresh-on-wake-plan.md`
- `.claude/handoffs/2026-04-20-155612-feed-auto-refresh-on-wake.md`
- `.claude/handoffs/2026-04-20-163932-ce-review-feed-auto-refresh.md`
- GitHub issue search: no matching issues found via `gh issue list --search "feed auto refresh wake resume ingestion" --state all --limit 5`
