---
title: Test specs should isolate env vars and simplify mock reset patterns
date: 2026-04-30
category: best-practices
module: apps/api feed ingestion specs
problem_type: best_practices
component: testing_framework
severity: low
applies_when:
  - reviewing test spec setup/teardown functions
  - env vars are set in beforeEach but never cleaned in afterEach
  - jest.mockReset() called individually on every mock when clearAllMocks() suffices
  - DATABASE_URL is hardcoded in test setup despite no real DB usage
tags:
  [
    apps-api,
    feed-ingestion,
    spec,
    test-setup,
    env-isolation,
    mock-management,
    best-practices,
  ]
---

# Test specs should isolate env vars and simplify mock reset patterns

## Context

In `apps/api/src/feeds/feed-ingestion.service.spec.ts`, `resetFeedIngestionSpecState()`
has several issues:

1. `DATABASE_URL` is hardcoded but never cleaned up in `afterEach`, risking env pollution
   across specs.
2. All mocks are fully mocked (no real DB), making `DATABASE_URL` setting redundant for
   the actual test logic.
3. Seven individual `.mockReset()` calls could be replaced with `jest.clearAllMocks()`.
4. `jest.restoreAllMocks()` in `afterEach` conflicts with `afterAll` — restore belongs at
   suite level, clear at test level.

## Pattern

**Do:**

- Extract magic strings (env values, URLs) into named constants at file scope.
- Use `jest.clearAllMocks()` instead of resetting each mock individually.
- Clean up any env mutations in `afterEach` (`delete process.env[...]`).
- Keep `restoreAllMocks()` in `afterAll` only, not duplicated in `afterEach`.
- Only set env vars that the code under test actually reads.

**Don't:**

- Set env vars as "just in case" safety nets when no code path needs them.
- Leave env pollution across test cases.
- Mix `restoreAllMocks` and `mockReset` at the same scope without clear reason.

## Fix

```ts
const DATABASE_URL = "postgresql://rssift:rssift@127.0.0.1:5432/rssift";

function resetFeedIngestionSpecState() {
  jest.useRealTimers();
  process.env["DATABASE_URL"] = DATABASE_URL;
  delete process.env["FEED_MAX_ARTICLES_PER_FEED"];

  jest.clearAllMocks();

  transaction.mockImplementation((callback) => Promise.resolve(callback(tx)));
  feedUpsert.mockResolvedValue({ id: "feed-1" });

  service = createFeedIngestionService();
  tempDir = mkdtempSync(join(tmpdir(), "rssift-feed-ingestion-spec-"));
}

afterEach(() => {
  delete process.env["DATABASE_URL"];
  if (tempDir) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

afterAll(() => {
  jest.restoreAllMocks();
});
```

## Why this matters

- Env pollution is silent: one spec setting `DATABASE_URL` can cause another spec to
  accidentally hit a real DB or read stale config.
- Individual mock resets are verbose and error-prone when adding new mocks.
- `restoreAllMocks` in both `afterEach` and `afterAll` is redundant.
