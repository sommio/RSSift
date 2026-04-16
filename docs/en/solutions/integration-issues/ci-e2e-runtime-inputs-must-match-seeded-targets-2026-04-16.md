---
title: Keep CI e2e runtime inputs aligned with seeded targets and managed server phases
date: 2026-04-16
category: integration-issues
module: ci e2e pipeline
problem_type: integration_issue
component: testing_framework
symptoms:
  - apps/api e2e could pass locally but fail in CI with database mismatch symptoms such as "The table public.Article does not exist in the current database"
  - apps/web Playwright could pass with apps/web/.env.local present but fail in GitHub Actions when the managed web server did not receive the same API base URL during build and start
  - pr-quality / e2e stayed red after earlier CI fixes had already turned scope, format, static, and test green
root_cause: config_error
resolution_type: config_change
severity: high
related_components:
  - database
  - development_workflow
tags:
  [
    ci,
    e2e,
    playwright,
    jest,
    prisma,
    database-url,
    api-base-url,
    github-actions,
  ]
---

# Keep CI e2e runtime inputs aligned with seeded targets and managed server phases

## Problem

The remaining CI failures on the `feat/feed-ingestion` branch were not caused by one broken test. They came from runtime inputs drifting away from the reset, seed, and build steps that the e2e harness assumed were authoritative.

In practice, the API e2e suite and the web Playwright suite each had one hidden alignment bug. Locally, those bugs were easy to miss because `.env.local` and same-value database URLs masked the drift.

## Symptoms

- GitHub Actions `pr-quality / e2e` stayed red after the other PR quality jobs were already green.
- API e2e could fail in CI with missing-table or wrong-database behavior because the Nest app read `DATABASE_URL` while the test helper reset and seeded `TEST_DATABASE_URL`.
- A local reproduction with different `DATABASE_URL` and `TEST_DATABASE_URL` exposed the same mismatch that CI was hitting.
- Web Playwright failed in `apps/web/e2e/home.spec.ts` because `API_BASE_URL` was only injected inline before `pnpm start`, while the Playwright-managed `pnpm build && pnpm start` flow in CI needed the same value across both phases.
- Local success with `apps/web/.env.local` present created false confidence because CI did not have that file.

## What Didn't Work

- Earlier CI fixes such as optional `.env.local` loading, placeholder `DATABASE_URL` for `prisma generate`, and `??=` defaults in e2e specs were necessary, but they did not solve the final e2e failures on their own.
- Letting the API e2e suite keep its own `DATABASE_URL` default still allowed the booted Nest app to talk to a different database from the one prepared by `prepareTestDatabase()`.
- Keeping `prisma migrate reset --config ./prisma.test.config.ts --force` in `pretest:e2e` fought the repo-owned `prepareTestDatabase()` flow and locally reproduced `_prisma_migrations` / `P1014` style failures instead of simplifying setup.
- Passing `API_BASE_URL=http://127.0.0.1:3000` inline only before `pnpm start` looked correct locally, but it did not clearly guarantee that the managed Next.js build and start phases were using one shared runtime contract.

## Solution

Use one owner for reset/seed, and make every booted app process read the same runtime inputs as that owner.

For the API e2e suite, force the app under test to read the same database URL that the test helper resets and seeds:

```ts
process.env["TEST_DATABASE_URL"] ??=
  "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"];
process.env["INGEST_ON_BOOT"] ??= "false";

await prepareTestDatabase();
```

That change lives in `apps/api/test/articles.e2e-spec.ts` and keeps the booted `AppModule` aligned with the fixture database.

For the API package script surface, remove the redundant Prisma reset from `pretest:e2e` so the repo's custom helper remains the only reset owner:

```json
{
  "scripts": {
    "pretest:e2e": "pnpm db:generate"
  }
}
```

That change lives in `apps/api/package.json`. `prepareTestDatabase()` already handles schema reset plus SQL migration replay, so layering Prisma reset on top only adds a second, conflicting lifecycle controller.

For the web Playwright suite, give the managed Next.js web server one shared environment block so both `pnpm build` and `pnpm start` receive the same `API_BASE_URL`:

```ts
const webRuntimeEnv = {
  ...process.env,
  API_BASE_URL: process.env["API_BASE_URL"] ?? "http://127.0.0.1:3000",
  NO_COLOR: "",
};

{
  command: "pnpm build && pnpm start",
  env: webRuntimeEnv,
}
```

That change lives in `apps/web/playwright.config.ts`. It removes the hidden dependency on `apps/web/.env.local` and makes the Playwright-managed web server phase-consistent in CI.

## Why This Works

Both failures came from the same class of integration bug: the e2e harness prepared one environment, but the booted application process consumed another.

The API fix works because app-backed e2e suites are only valid when the reset target, the seed target, and the running Nest app all point at the same database. Explicitly assigning `DATABASE_URL = TEST_DATABASE_URL` makes that invariant true before the app starts.

Removing `prisma migrate reset` works because this repo already has a purpose-built reset path in `apps/api/test/test-db.ts`. A single reset owner is easier to reason about and avoids Prisma metadata assumptions colliding with the custom migration replay flow.

The web fix works because Playwright's managed server wraps the whole command lifecycle. Putting `API_BASE_URL` in the `env` block gives both the build phase and the start phase the same value, instead of relying on inline shell syntax or a local-only `.env.local` file.

## Prevention

- For any app-backed e2e suite, decide which URL is authoritative for reset/seed, then force the booted app to use that same URL before startup.
- Do not stack multiple database reset mechanisms unless they are intentionally composed. If `prepareTestDatabase()` already owns reset plus migration replay, keep Prisma CLI reset out of `pretest:e2e`.
- For Playwright `webServer` entries, prefer an explicit `env` object over inline one-off variable prefixes when the app needs the variable during more than one phase.
- Reproduce CI-only failures locally by intentionally separating `DATABASE_URL` and `TEST_DATABASE_URL`, and by running the suite with `CI=true`.
- Treat local `.env.local` success as suspicious whenever CI does not provide the same file.
- When a CI fix makes most jobs green but e2e stays red, inspect whether the remaining failure is a runtime-input alignment issue rather than a generic test flake.

## Related Issues

- `docs/en/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`
- `.claude/handoffs/2026-04-16-151404-ci-e2e-fixes.md`
- `.claude/handoffs/2026-04-16-153021-ci-e2e-final-fixes.md`
- `.claude/handoffs/2026-04-16-160320-web-e2e-ci-followup.md`
- `.github/workflows/pr-quality.yml`
- `apps/api/test/articles.e2e-spec.ts`
- `apps/api/package.json`
- `apps/web/playwright.config.ts`
