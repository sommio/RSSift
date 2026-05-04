---
title: Article summary scheduling must support automatic backfill scanning for missed jobs
date: 2026-05-04
category: workflow-issues
module: article summary
problem_type: workflow_gap
component: background_job
symptoms:
  - summary jobs only run when an upstream caller explicitly invokes `ArticleSummaryService.schedule()`
  - startup backfill covers only the candidate set found at bootstrap time, so articles missed during runtime gaps are not automatically re-scanned later
  - transient misses in the ingestion or title-change path can leave articles without summaries until another manual or startup-triggered event happens
root_cause: workflow_gap
resolution_type: design_update
severity: medium
related_components:
  - nest_service
  - repository
  - bootstrap
  - scheduler
tags:
  [
    article-summary,
    backfill,
    schedule,
    bootstrap_backfill,
    automatic-scan,
    background-job,
    fail-open,
  ]
---

# Article summary scheduling must support automatic backfill scanning for missed jobs

## Problem

The current article summary pipeline is event-driven. `ArticleSummaryService.schedule()` only queues work when another code path explicitly calls it, and `ArticleSummaryBootstrapService` only performs a one-time bootstrap backfill at startup. That means the system does not continuously re-scan the database for articles that should have summaries but never received a schedule event.

## Review Note

Review feedback pointed out a follow-up requirement: the system needs automatic backfill scanning. In other words, the summary pipeline should not rely only on boot-time discovery and ad hoc event triggers if we want missed jobs to recover without operator intervention.

## Symptoms

- An article can be persisted with content but remain unsummarized if the `content_persisted` or `title_changed` trigger is missed.
- Articles missed during a process restart or temporary failure window do not get rediscovered unless another bootstrap or manual trigger happens.
- The current in-memory queue only reflects jobs already scheduled in the current process; it does not reconstruct missed work from durable state.

## What Did Not Work

- Treating `schedule()` as the only entry point makes the runtime flow simple, but it leaves recovery gaps.
- Bootstrap-only backfill helps cold start recovery, but it does not close the gap for articles missed after startup.
- Depending on upstream callers to remember every trigger is brittle because missed events become silent summary starvation.

## Solution

Add a durable automatic backfill scanning path that periodically queries the repository for unsummarized candidates and re-submits them into `ArticleSummaryService.schedule()`.

The scanning job should:

- read from durable database state, not from in-memory queue state
- deduplicate against currently tracked jobs before scheduling
- preserve fail-open behavior by only touching articles that still need summary work
- run on a bounded cadence so missed jobs are eventually recovered without manual bootstrap

A good split is:

- `ArticleSummaryBootstrapService`: one-time startup backfill
- `ArticleSummaryScanService` or equivalent scheduler: recurring database scan for missed jobs
- `ArticleSummaryService`: in-memory execution and retry mechanics only

## Why This Works

This approach separates three responsibilities that are currently mixed together:

- database discovery tells the system what is missing
- scheduling decides what enters the current process queue
- execution handles retries, logging, and persistence

With a recurring scan, the system can recover from missed triggers, process restarts, and transient runtime gaps without requiring an operator to manually re-run bootstrap logic.

## Prevention

- Any background job that depends on explicit triggers should also define a durable recovery scan if missed events are acceptable.
- Keep bootstrap recovery and recurring backfill separate so startup logic does not become the only safety net.
- Review in-memory queues as execution caches, not as the source of truth for work discovery.
- When review feedback asks for automatic recovery, prefer a durable scan over widening the responsibilities of `schedule()`.

## Related Context

- `apps/api/src/article-summary/article-summary.service.ts`
- `apps/api/src/article-summary/article-summary-bootstrap.service.ts`
- `docs/en/solutions/logic-errors/article-summary-retryable-failures-must-not-clear-existing-summary-2026-04-18.md`
- `docs/zh-Hans/solutions/logic-errors/article-summary-retryable-failures-must-not-clear-existing-summary-2026-04-18.md`
- `docs/en/solutions/integration-issues/feed-ingestion-retries-missing-article-markdown-2026-04-17.md`
- `docs/zh-Hans/solutions/integration-issues/feed-ingestion-retries-missing-article-markdown-2026-04-17.md`
