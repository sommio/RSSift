---
title: Feed module should split parsing, persistence, and orchestration
date: 2026-04-28
category: developer-experience
module: apps/api feeds
problem_type: developer_experience
component: feature_module_design
severity: medium
applies_when:
  - reviewing `apps/api/src/feeds` for maintainability or simplification
  - `feed-ingestion.service.ts` mixes fetch, normalization, persistence, and follow-up work
  - bootstrap and wake-resume logic are thin wrappers around a large ingestion service
  - helper files exist, but the module still feels hard to read end-to-end
tags:
  [
    apps-api,
    feeds,
    nestjs,
    feature-modules,
    maintainability,
    simplification,
    developer-experience,
  ]
---

# Feed module should split parsing, persistence, and orchestration

## Context

`apps/api/src/feeds` works, but the module is doing too many jobs in one place.

The current shape puts several different responsibilities next to each other:

- OPML reading and feed list extraction
- feed request / timeout / retry handling
- feed item normalization and ranking
- article upsert logic
- downstream content enrichment
- summary refresh scheduling
- bootstrap and wake-resume orchestration

That makes `feed-ingestion.service.ts` hard to scan. The service is not just
"one service with a few helpers"; it is the center of a small ingestion system.

The file structure already hints at the split, but the code still reads like a
single long pipeline with several side effects hidden in the middle.

## Guidance

Prefer a narrower shape:

- keep one small orchestrator for ingestion flow control
- move pure feed parsing / normalization helpers into dedicated utility or
  mapper files
- move persistence decisions into a separate repository-style class or
  persistence helper
- keep bootstrap and wake-resume services as thin lifecycle adapters
- make downstream enrichment / summary refresh steps explicit instead of
  burying them inside the main ingestion loop

The main goal is not more files for their own sake. The goal is to make each
step nameable:

- "read subscriptions"
- "fetch and parse one feed"
- "normalize items"
- "persist article changes"
- "trigger follow-up work"

If a reader can understand the module by following those verbs, the code is in a
much better place.

## Why This Matters

The current shape increases cognitive load in three places:

1. **Reading**: the ingestion service is long enough that you must hold too many
   states in your head at once.
2. **Changing**: any edit risks touching fetch, data normalization, persistence,
   and logging at the same time.
3. **Reviewing**: review comments become about "what belongs where" instead of
   the actual behavior change.

That is a developer-experience problem, not just an aesthetic one.

The module is also a good candidate for future drift if new feed-side behavior
keeps piling into the same file.

## Specific Findings: `persistNormalizedArticles`

Review of `feed-ingestion.service.ts:386-476` surfaced concrete violations:

### 1. Missing Repository Layer

Other feature modules (`articles/`, `article-content/`, `article-summary/`) all use
a dedicated repository class for Prisma access. `FeedIngestionService` calls
`this.prisma` directly. This breaks the established pattern.

Expected: `FeedIngestionRepository` encapsulating all Prisma operations in the
feeds module.

### 2. N+1 Query Pattern (find-then-create/update)

Lines 417-468: for each normalized article, `findFirst` runs inside the
transaction to decide between create and update. With many articles per feed,
this produces O(N) queries where one `upsert` or batch operation would suffice.

### 3. Fragile OR Filter Construction

Lines 420-427:

```typescript
OR: [
  article.sourceId ? { sourceId: article.sourceId } : undefined,
  article.originalUrl ? { originalUrl: article.originalUrl } : undefined,
  { identityHash: article.identityHash },
].filter(Boolean) as Array<Record<string, unknown>>,
```

The `.filter(Boolean) as Array<...>` cast hides potentially empty OR arrays and
relies on runtime truthiness rather than type-safe query building. A repository
method with explicit upsert logic would eliminate this.

### 4. Mixed Concerns in Single Transaction

The method upserts the feed record AND persists all articles in one
`$transaction`. These are semantically separate: feed metadata update should not
block or roll back article persistence. Splitting into a feed repository method
and an article repository method makes each independently testable and
composable.

## When to Apply

- when `apps/api/src/feeds/feed-ingestion.service.ts` starts feeling like a
  mini application rather than a service
- when review feedback keeps saying "this is too much in one file"
- when adding new feed behavior would make the main service longer instead of
  clearer
- when bootstrap, auto-refresh, and ingestion logic are growing together

## Related

- `apps/api/src/feeds/feed-ingestion.service.ts`
- `apps/api/src/feeds/feed-ingestion.parsers.ts`
- `apps/api/src/feeds/feed-bootstrap.service.ts`
- `apps/api/src/feeds/feed-auto-refresh.service.ts`
- `apps/api/src/feeds/feed-auto-refresh.repository.ts`
- `docs/zh-Hans/solutions/developer-experience/feed-module-should-split-parsing-persistence-and-orchestration-2026-04-28.md`
