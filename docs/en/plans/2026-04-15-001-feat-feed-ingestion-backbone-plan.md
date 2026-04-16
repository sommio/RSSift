---
title: feat: Implement the v0.1 slice 2 feed ingestion backbone
type: feat
status: completed
date: 2026-04-15
deepened: 2026-04-15
origin:
  - docs/en/brainstorms/2026-04-15-v0-1-slice-2-feed-ingestion-requirements.md
  - docs/zh-Hans/brainstorms/2026-04-15-v0-1-slice-2-feed-ingestion-requirements.md
---

# feat: Implement the v0.1 slice 2 feed ingestion backbone

## Overview

This plan replaces the current fixture-backed API read path with a real startup-time feed ingestion backbone in `apps/api`, while keeping the public `/articles` contract thin and stable. The slice stays intentionally narrow: read a fixed local `apps/api/feeds.opml`, ingest feeds on startup, persist `Feed` and `Article` records in PostgreSQL through Prisma, cut article reads over to persisted data only, update CI so GitHub-hosted e2e provisions its own PostgreSQL 18, and document the resulting local workflow across the bilingual repo docs.

The user also added execution-shaping constraints that materially affect the plan:

- Local PostgreSQL verification and operator docs must use `psql-18`, not bare `psql`.
- The standard development and test databases already exist and must be treated as established local prerequisites:
  - `DATABASE_URL="postgresql://rssift:rssift@127.0.0.1:5432/rssift"`
  - `TEST_DATABASE_URL="postgresql://rssift:rssift@127.0.0.1:5432/rssift_test"`
- App runtime env ownership should move to app-level files instead of continuing a root-only habit. The plan therefore assumes committed `*.env.example` files plus local app-owned env files during implementation.
- New packages must be installed with `pnpm` into the owning workspace using the newest compatible stable versions practical at implementation time, while stopping for real dependency conflicts instead of forcing overrides blindly.
- The startup guide should be refreshed in both `README.md` and `README.zh-Hans.md`, with app-level README updates where the local workflow changes.
- The backend local runtime env file should align with the frontend convention and use `apps/api/.env.local`.
- The fixed OPML file should live under `apps/api/` because it is an API-owned runtime input, not a repo-root artifact.
- GitHub Actions e2e must provision PostgreSQL 18 inside the workflow itself instead of depending on any external database.

When an implementation unit says `Execution target: external-delegate`, that phrase is only an execution posture signal. It does not change scope, sequencing, or acceptance criteria.

## Package Selection

- Install `feedsmith` in `apps/api` as the default parser surface for this slice. Current package research shows it covers OPML 1.0/2.0 plus RSS, Atom, RDF, and JSON Feed in one maintained Node/TypeScript-friendly package, which avoids introducing separate OPML and feed parsers up front.
- Do not initially install `opml`, `rss-parser`, or `@extractus/feed-extractor`. They remain fallback options only if `feedsmith` hits a real integration boundary during implementation.
- Keep the R17 install policy: resolve the newest compatible stable version practical at execution time with `pnpm`, install it only into `apps/api`, and stop if dependency resolution becomes conflict-heavy.

## Problem Frame

`apps/api` currently serves article list and detail data from `apps/api/src/articles/article-fixture.repository.ts` and `apps/api/src/articles/fixtures/prepared-articles.json`. That fixture seam was explicitly appropriate for the first runnable read-path slice, but it now blocks the next v0.1 milestone: proving that the product can read a fixed subscription file, fetch real feeds, persist real records, and still serve the same thin article API contract.

The paired brainstorm documents already narrowed the product problem carefully: this slice is not trying to solve body extraction, summarization, feed management, scheduling, or a broader admin surface. It only needs to prove the ingestion backbone and read-path cutover. Planning therefore has to solve a technical cross-section rather than reopen product scope:

- pick the PostgreSQL-friendly Prisma shape that fits this NestJS app and monorepo
- make startup ingestion best-effort rather than all-or-nothing
- encode a stable article identity rule that survives repeated boots
- move runtime configuration ownership to the relevant app boundaries
- update bilingual operator documentation so the new local database workflow is reproducible

## Requirements Trace

### Behavior & Data

- R1. The system must read subscriptions from a fixed local file named `feeds.opml`, owned under `apps/api/` for this slice.
- R2. Feed ingestion must trigger automatically during API startup.
- R3. One failing feed must not prevent attempts on the remaining feeds during the same startup run.
- R4. Real `Feed` and `Article` records must be persisted to PostgreSQL; the article API must stop depending on static fixtures.
- R5. After cutover, `/articles` and `/articles/:id` must read only persisted records and must not fall back to fixture data, including after partially successful ingestion runs.
- R6. Article deduplication must be enforced per feed through a deterministic application-derived `identityHash` plus a database uniqueness constraint.
- R7. The existing article-detail `summary` field remains a compatibility field backed by feed-provided description/excerpt text or an empty string when unavailable.
- R8. The first `Feed` model stays minimal and only includes fields required for ingestion, conditional fetches, and read-path support.
- R9. The public API surface for this slice remains limited to the existing read-only `/articles` contract; no `/feeds` or ingestion-control endpoints are added.
- R10. The first `Article` model must preserve both `publishedAt` and `ingestedAt`.
- R11. Prisma schema organization must be modular from the start and must align with backend domain boundaries while preserving one migration history.
- R12. Startup ingestion must emit structured per-feed logs and a startup summary that distinguishes full success, partial success, and full failure.
- R13. API startup must not require every feed fetch to succeed before the application can serve requests.
- R14. This slice must use PostgreSQL consistently across local runtime and tests; it must not introduce a SQLite development split.
- R15. Local database setup guidance must explicitly use `psql-18`, and the plan must treat the pre-created `rssift` and `rssift_test` databases as fixed local prerequisites rather than new work.

### Runtime, Dependency, and CI Policy

- R16. App runtime env files should be owned by the relevant apps, with committed `.env.example` files and local app env files created during implementation instead of expanding root-level runtime env sprawl. For local development, `apps/api` should use `.env.local` to match the existing `apps/web` convention.
- R17. Any newly installed packages must be added with `pnpm` to the owning workspace using the newest compatible stable versions practical at execution time; if dependency resolution turns into peer-conflict churn or override-heavy work, implementation must stop and surface that explicitly.
- R18. The GitHub Actions e2e path must provision PostgreSQL 18 inside the workflow itself and must not depend on any external database service.

### Documentation Sync

- R19. Root and app-level durable docs must remain semantically synchronized across English and Simplified Chinese when the local startup flow changes.

## Scope Boundaries

- Do not add body extraction, generated summaries, translation, or layered reading UX.
- Do not add feed CRUD, OPML import/export UI, or ingestion-control endpoints.
- Do not add schedulers, cron jobs, or background refresh beyond startup ingestion.
- Do not introduce a persistent ingestion run-state model beyond structured logs plus a startup summary.
- Do not split development and deployment across different database providers.
- Do not expand the web app's public behavior beyond continuing to consume the unchanged `/articles` contract.
- Do not move app runtime configuration back into the root package or root README as the primary ownership boundary.
- Do not hardcode migration or install command choreography into the plan; execution can choose the exact `pnpm` and Prisma commands later.

## Context & Research

### Relevant Code and Patterns

- `apps/api/src/articles/articles.module.ts`, `apps/api/src/articles/articles.service.ts`, and `apps/api/src/articles/articles.controller.ts` show the current thin feature-module structure for article reads.
- `apps/api/src/articles/article-fixture.repository.ts` and `apps/api/src/articles/fixtures/prepared-articles.json` are the exact seam this slice should replace.
- `apps/api/src/main.ts` already centralizes startup bootstrap, CORS, and the default API port; this is the natural place to let lifecycle-triggered ingestion happen without inventing a second entrypoint.
- `apps/web/src/widgets/article-reader/api/articles-api.ts` already treats `API_BASE_URL` as required and explicitly references `apps/web/.env.local` or `apps/web/.env.example`, but `apps/web/.env.example` is currently absent.
- The repo currently has a root `.env`, but no committed app-owned runtime env examples for `apps/api` and `apps/web`. That is a mismatch with the desired app-owned env boundary, and the backend local file name still needs to converge on `.env.local`.
- The current repo has no Prisma schema, no PostgreSQL access layer, no OPML file, and no feed ingestion implementation to mirror directly. This is greenfield inside an otherwise brownfield monorepo.
- `turbo.json` currently defines root-level task orchestration and includes `**/.env.*local` in `globalDependencies`, but it does not yet describe app-owned API env files or the tighter hashing story needed for this slice.
- `.github/workflows/pr-quality.yml` currently runs `pr-quality / test` and `pr-quality / e2e`, but the workflow does not yet provision PostgreSQL 18 itself for database-backed API verification.

### Institutional Learnings

- `docs/en/solutions/developer-experience/root-pnpm-typecheck-uses-turbo-workspace-coverage-2026-04-13.md` and `docs/zh-Hans/solutions/developer-experience/root-pnpm-typecheck-uses-turbo-workspace-coverage-2026-04-13.md` warn that root `pnpm typecheck` only proves what the Turbo task graph covers. Any new workspace-facing verification must remain package-owned and wired into Turbo explicitly.
- `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md` and `docs/zh-Hans/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md` reinforce that monorepo workflows should run from the owning package rather than through root-only wrappers.
- `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md` and `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md` require bilingual durable docs to move together whenever semantics, examples, or paths change.
- `docs/en/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md` and `docs/zh-Hans/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md` are relevant for verification scope: changes touching app code, root docs, and shared config should not be treated as app-local-only work.

### External References

- OPML 2.0 specification: `https://opml.org/spec2.opml`
- RSS 2.0 specification: `https://www.rssboard.org/rss-2-0`
- feedsmith docs: `https://next.feedsmith.dev/`
- feedsmith package: `https://www.npmjs.com/package/feedsmith`
- opml package: `https://www.npmjs.com/package/opml`
- rss-parser package: `https://www.npmjs.com/package/rss-parser`
- @extractus/feed-extractor package: `https://www.npmjs.com/package/@extractus/feed-extractor`
- RSS Best Practices Profile: `https://www.rssboard.org/rss-profile`
- Atom RFC 4287: `https://datatracker.ietf.org/doc/html/rfc4287`
- NestJS lifecycle events: `https://docs.nestjs.com/fundamentals/lifecycle-events`
- NestJS standalone applications: `https://docs.nestjs.com/application-context`
- NestJS configuration: `https://docs.nestjs.com/techniques/configuration`
- Prisma schema location and directory support: `https://www.prisma.io/docs/orm/prisma-schema/overview/location`
- Prisma config reference: `https://www.prisma.io/docs/orm/prisma-schema/prisma-config-reference`
- Prisma multi-schema / provider support: `https://www.prisma.io/docs/orm/prisma-schema/data-model/multi-schema`
- Prisma migration histories: `https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/migration-histories`
- Prisma migrate limitations and provider consistency constraints: `https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues`
- Turborepo env guidance: `https://turborepo.dev/docs/crafting-your-repository/using-environment-variables`
- Turborepo package configurations: `https://turborepo.dev/docs/reference/package-configurations`
- pnpm workspaces: `https://pnpm.io/workspaces`
- pnpm filtering: `https://pnpm.io/filtering`
- pnpm add: `https://pnpm.io/cli/add`
- pnpm update: `https://pnpm.io/cli/update`
- Twelve-Factor config: `https://12factor.net/config`
- Twelve-Factor backing services: `https://12factor.net/backing-services`
- Vercel examples env-file expectation: `https://github.com/vercel/examples`

## Key Technical Decisions

- Use PostgreSQL end-to-end for this slice. The repo should not introduce a development-only SQLite provider because Prisma migration history remains provider-specific and the brainstorm already ruled the split-provider path out.
- Use Prisma's official schema-directory workflow under `apps/api` with one migration history. The plan assumes `apps/api/prisma.config.ts` points at a schema directory, `apps/api/prisma/schema/schema.prisma` stays the entry file, and domain-specific files such as `apps/api/prisma/schema/feed.prisma` and `apps/api/prisma/schema/article.prisma` hold the split models.
- Use `feedsmith` as the initial parser dependency in `apps/api`. It is the default fit for this slice because it can parse both the API-owned `apps/api/feeds.opml` file and the downstream feed formats without forcing a split parser stack on day one.
- Keep Prisma migrations as the single source of truth under `apps/api/prisma/migrations/`. Execution may generate them in different ways locally versus CI, but it must not edit or fork applied migration history casually.
- Start ingestion during API startup, but do not let feed I/O gate HTTP availability once local prerequisites have validated. The bootstrap runner should launch the ingestion run during startup, enforce both a per-feed timeout and a whole-run budget, and allow the API to serve while the bounded ingestion run finishes in the background.
- Make missing or invalid local prerequisites startup-blocking errors: invalid database config, invalid bootstrap config, or a missing or malformed OPML file at the resolved path should stop startup. Once those prerequisites pass, even a full feed-fetch failure should leave the API running and serving previously persisted data while logs report `full failure`.
- Resolve article identity derivation now. Use the best available source-native stable identifier first (`guid`, `atom:id`, or equivalent item id), then a normalized canonical URL, then a deterministic content-derived signature as the final fallback. URL normalization should trim whitespace, parse an absolute URL, lowercase scheme and host, remove fragments and default ports, preserve path and query, and treat an empty path as `/`. The final content-signature fallback should be derived from the feed-scoped tuple of normalized title, source-published timestamp when present, and a whitespace-collapsed description/excerpt input.
- Persist identity audit fields alongside `identityHash`: keep the strongest raw upstream identifier in `sourceId`, and also persist `identitySourceType` plus `identitySourceValue` for the exact canonical input that was hashed. Once an article row exists, treat that canonical identity input as immutable so parser or normalization changes do not silently rewrite dedup behavior.
- Use an immutable database-generated article primary key as the public article `id`. It is created on first insert, reused on later updates, and never recomputed from `identityHash`, so `/articles/:id` remains stable across repeated ingestions.
- Keep feed-level operational state minimal. Store fields that make later conditional fetches possible (`etag`, `lastModified`), but do not add a durable run-state table in this slice. Each feed ingestion should still write atomically: feed metadata and article mutations for one feed commit or roll back together, and this slice should not delete previously persisted articles just because they are absent from a later fetch.
- Keep runtime env ownership app-local. `apps/api` owns database env examples and the local `apps/api/.env.local`; `apps/web` owns `API_BASE_URL` examples and local overrides; root `.env` remains for repo-global tooling secrets only. The fixed file name stays `feeds.opml`, but path resolution should go through app config such as `FEED_OPML_PATH`, defaulting to `apps/api/feeds.opml` instead of assuming `process.cwd()` is the repo root in every mode.
- Require local PostgreSQL verification language to say `psql-18` everywhere in docs and verification notes. This is a repo-specific operator constraint, not optional wording.
- Treat test lifecycle control as part of the architecture, not an implementation afterthought. `apps/api` should own a package-local strategy for test DB migrate/reset and startup-bootstrap control, such as `INGEST_ON_BOOT=false` and OPML path overrides in test contexts, so `test` and `test:e2e` are not coupled to local files or live network feeds.
- Treat CI database ownership as part of the same boundary. The GitHub workflow should provision its own PostgreSQL 18 service for database-backed e2e verification and create the needed ephemeral database(s) inside the job rather than relying on any external host.
- Treat package installation policy as part of the plan: new registry packages go into the owning workspace with `pnpm`, using the newest compatible stable versions practical at execution time. Workspace packages continue to use `workspace:*` dependencies. If installs require overrides, forced peer-resolution, or similar conflict-heavy moves, execution should stop and surface that branch explicitly.
- Keep the public article API contract unchanged for the web app. The read path changes from fixtures to PostgreSQL, but `GET /articles` and `GET /articles/:id` remain the only public surfaces and keep the same shape.

## Resolved During Planning

- **Where should the fixed OPML file live?** Keep the fixed filename `feeds.opml`, store it at `apps/api/feeds.opml`, and resolve it through API config such as `FEED_OPML_PATH`. Tests and alternative runtimes can still override the path explicitly.
- **What exact identity fallback order should be used before hashing?** Use source-native stable id first, normalized canonical URL second, deterministic content signature third.
- **What must be persisted alongside `identityHash` for diagnosability and safe future repair?** Persist `identitySourceType`, `identitySourceValue`, and the strongest upstream `sourceId` in addition to the hash itself.
- **What is the public article id?** Use the immutable database-generated article primary key as the public `id`, created on first insert and preserved across later ingestions.
- **Should this slice persist ingestion error records separately from logs?** No. Structured per-feed logs and a startup summary are sufficient for v0.1 slice 2.
- **How should Prisma modularization fit the backend architecture?** Keep one `apps/api/prisma/` migration root, but split the schema files by domain so feed and article modeling do not collapse into a single long-term monolith.
- **Who owns runtime env files?** The app that consumes them. `apps/api` owns database env files and bootstrap toggles and uses `apps/api/.env.local` for local runtime; `apps/web` owns `API_BASE_URL` and uses `apps/web/.env.local`; root `.env` should not become the default place for app runtime config.
- **How should local DB access be documented?** All local docs should treat the following databases as already provisioned and should reference `psql-18` for inspection and verification:
  - `DATABASE_URL="postgresql://rssift:rssift@127.0.0.1:5432/rssift"`
  - `TEST_DATABASE_URL="postgresql://rssift:rssift@127.0.0.1:5432/rssift_test"`
- **Does a `full failure` ingestion summary stop the API?** No. Only invalid local prerequisites block startup. Once bootstrap prerequisites validate, even a `full failure` feed run still leaves the API serving previously persisted data.
- **How should tests control startup ingestion?** Through app-owned bootstrap controls such as `INGEST_ON_BOOT=false`, explicit OPML path overrides, and package-owned test DB migrate/reset workflows in `apps/api`.
- **Which parser package should implementation start with?** Install `feedsmith` in `apps/api` first; only fall back to separate packages if it proves insufficient in real integration.
- **How should CI e2e handle PostgreSQL?** `.github/workflows/pr-quality.yml` should provision PostgreSQL 18 inside the workflow job, create the required ephemeral test database there, and inject CI-specific DB env values instead of depending on any external database.

## Deferred to Implementation

- The exact numeric values for per-feed network timeouts and the whole-run ingestion budget, as long as both limits exist, are testable, and do not turn feed I/O into an implicit readiness gate.
- Whether the env-hashing changes live entirely in root `turbo.json` or require package-local Turbo config as well.
- The precise naming and wiring of package-owned test DB migrate/reset scripts and bootstrap override helpers, as long as `apps/api` owns that lifecycle and tests do not depend on live feeds by default.

## Dependencies / Prerequisites

- Node.js `24.14.1` or later and `pnpm@10.33.0` or later.
- Local PostgreSQL reachable at `127.0.0.1:5432` with the pre-created databases `rssift` and `rssift_test`.
- PostgreSQL client available as `psql-18` for local verification and operator instructions.
- A local `apps/api/feeds.opml` file present before runtime ingestion can succeed.
- Willingness to accept one or more new `apps/api` dependencies for Prisma and feed parsing, provided they pass the R17 install policy.

## Alternative Approaches Considered

- **Keep fixtures for one more slice** — rejected because R4 and R5 explicitly make the fixture cutover part of this slice's definition.
- **Use SQLite locally and PostgreSQL elsewhere** — rejected because Prisma migration history is provider-specific and the brainstorm already marked provider consistency as a hard requirement.
- **Persist a full ingestion run-state model now** — rejected because structured logs plus a startup summary already satisfy the operability requirement without adding extra scope.
- **Put all runtime env in the repo root** — rejected because Turborepo guidance favors app-owned env files and this repo already suffers from an app-env/documentation mismatch.
- **Fail API startup if any feed fails** — rejected because R3 and R13 require feed-level isolation and best-effort startup.

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce._

```mermaid
flowchart TB
    OPML[apps/api/feeds.opml] --> Bootstrap[API startup bootstrap]
    Env[apps/api/.env.local] --> Bootstrap
    Bootstrap --> Ingest[Feed ingestion orchestrator]
    Ingest --> Loop[Per-feed fetch and parse loop]
    Loop --> Identity[Identity derivation]
    Identity --> Persist[Prisma upsert into PostgreSQL]
    Persist --> Logs[Structured per-feed logs + startup summary]
    Persist --> Articles[Article read repository]
    Articles --> List[GET /articles]
    Articles --> Detail[GET /articles/:id]
    WebEnv[apps/web/.env.local] --> Web[apps/web article reader]
    List --> Web
    Detail --> Web
```

## Implementation Units

```mermaid
flowchart TB
    U1[Unit 1: App-owned config and env baseline] --> U2[Unit 2: Prisma/PostgreSQL schema baseline]
    U1 --> U3[Unit 3: Startup ingestion pipeline]
    U2 --> U3
    U2 --> U4[Unit 4: Persisted article read-path cutover]
    U3 --> U4
    U2 --> U5[Unit 5: CI e2e PostgreSQL 18 workflow]
    U4 --> U5
    U1 --> U6[Unit 6: Bilingual bootstrap docs and examples]
    U5 --> U6
```

- [x] **Unit 1: Establish app-owned runtime config, env examples, and bootstrap control boundaries**

**Goal:** Move runtime configuration ownership to the relevant apps, encode the established local PostgreSQL assumptions, and add the minimum bootstrap controls needed for reproducible runtime and tests.

**Requirements:** R14, R15, R16, R17, R19

**Dependencies:** None

**Files:**

- Modify: `apps/api/package.json`
- Modify: `turbo.json`
- Create: `apps/api/.env.example`
- Create: `apps/web/.env.example`
- Create: `apps/api/feeds.opml.example`
- Create (local-only): `apps/api/.env.local`
- Create (local-only): `apps/web/.env.local`
- Create (local-only): `apps/api/feeds.opml`
- Create: `apps/api/src/config/app-config.ts`
- Create: `apps/api/src/config/app-config.spec.ts`
- Create: `apps/api/src/config/env.validation.ts`

**Approach:**

- Add a minimal API-owned config layer that validates `DATABASE_URL`, `TEST_DATABASE_URL`, `FEED_OPML_PATH`, and `INGEST_ON_BOOT`, using the already provisioned local database values as the documented bootstrap defaults.
- Commit `apps/api/.env.example` and `apps/web/.env.example`, and keep the working local runtime files as `apps/api/.env.local` and `apps/web/.env.local` during implementation.
- Resolve the default OPML path from the `apps/api` package root rather than from `process.cwd()`, so `pnpm --filter api dev`, tests, and built `start:prod` mode all target the same default `apps/api/feeds.opml` file unless explicitly overridden.
- Tighten Turbo hashing so changes to app-owned env files invalidate the relevant tasks instead of relying on root-only assumptions.
- Keep package changes minimal. Modify `apps/api/package.json` only where package-owned bootstrap/test lifecycle wiring is genuinely needed; do not pull `apps/web/package.json` into this unit unless implementation proves a script change is necessary.
- Record the local PostgreSQL client requirement in config-facing docs and verification notes as `psql-18`, not bare `psql`.

**Execution note:** Before installing any new registry package, disclose the exact package list grouped by workspace ownership. This unit should keep root package changes limited to true repo-level tooling or task-graph updates.

**Patterns to follow:**

- `apps/web/src/widgets/article-reader/api/articles-api.ts`
- `README.md`
- `README.zh-Hans.md`
- `turbo.json`

**Test scenarios:**

- Happy path — API config bootstrap reads `DATABASE_URL`, `TEST_DATABASE_URL`, `FEED_OPML_PATH`, and `INGEST_ON_BOOT` from `apps/api/.env.local` and exposes them to downstream modules.
- Error path — missing `DATABASE_URL` fails API startup with a clear configuration error instead of falling back silently.
- Error path — missing `TEST_DATABASE_URL` fails test bootstrap or test config resolution clearly rather than defaulting to the runtime database.
- Edge case — `INGEST_ON_BOOT=false` disables startup ingestion for unit/e2e test contexts while keeping the application modules bootable.
- Integration — the default `FEED_OPML_PATH` resolves the same `apps/api/feeds.opml` file in `pnpm --filter api dev`, test override mode, and built `start:prod` mode.
- Integration — changing `apps/api/.env.example`, `apps/api/.env.local`, or `apps/web/.env.local` invalidates the relevant Turbo task hashes instead of reusing stale outputs.

**Verification:**

- Runtime config is app-owned, the established local DB URLs are explicit and documented, the default OPML path is reproducible across run modes, and tests can disable or redirect startup ingestion without depending on local operator files.

- [x] **Unit 2: Add Prisma PostgreSQL baseline with a modular schema directory and single migration history**

**Goal:** Introduce the database access foundation for this slice without breaking feature-module boundaries or Prisma's migration expectations.

**Requirements:** R4, R6, R8, R10, R11, R14, R17

**Dependencies:** Unit 1

**Files:**

- Modify: `apps/api/package.json`
- Create: `apps/api/prisma.config.ts`
- Create: `apps/api/prisma/schema/schema.prisma`
- Create: `apps/api/prisma/schema/feed.prisma`
- Create: `apps/api/prisma/schema/article.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_init_feed_ingestion/migration.sql`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/prisma/prisma.service.spec.ts`
- Create: `apps/api/test/prisma-schema.e2e-spec.ts`

**Approach:**

- Introduce Prisma inside `apps/api`, not at repo root, so dependency ownership stays aligned with the API app.
- Use Prisma's official schema-directory workflow: keep one entry schema file, split feed and article models into separate domain files, and preserve a single migration history under `apps/api/prisma/migrations/`.
- Model `Feed` minimally with `feedUrl`, `siteTitle`, `siteUrl`, `etag`, `lastModified`, and timestamps.
- Model `Article` with an immutable database-generated public `id`, `feedId`, `identityHash`, `identitySourceType`, `identitySourceValue`, `sourceId`, `title`, `originalUrl`, `publishedAt`, `ingestedAt`, `summary`, and timestamps.
- Add database-level constraints that support the planning decisions: unique `feedUrl`, composite unique `(feedId, identityHash)`, index on `feedId`, and index on `publishedAt`.
- Keep provider selection PostgreSQL-only across runtime and tests. Do not create a second schema branch or migration stream for another provider.

**Execution note:** This unit is a strong candidate for delegated implementation after package disclosure; delegation does not change scope or acceptance criteria.

**Patterns to follow:**

- `apps/api/src/articles/articles.module.ts`
- `AGENTS.md` guidance for feature-module-aligned backend structure
- Prisma official schema directory and migration references listed above

**Test scenarios:**

- Happy path — the generated schema creates `Feed` and `Article` tables with the expected relations, timestamps, and identity audit fields on the test database.
- Edge case — inserting the same `feedUrl` twice is rejected by the database unique constraint.
- Edge case — inserting the same `identityHash` twice under the same feed is rejected, while the same hash under different feeds remains allowed.
- Integration — applying the migration against `TEST_DATABASE_URL` yields the same schema shape expected by the runtime app without a provider mismatch.
- Integration — repeated upserts for the same logical article preserve its immutable public `id` once the row already exists.

**Verification:**

- `apps/api` owns a PostgreSQL-ready Prisma baseline with modular schema files, one migration history, stable public article ids, and the minimum constraints required for safe ingestion deduplication.

- [x] **Unit 3: Implement startup feed ingestion with per-feed failure isolation and deterministic identity derivation**

**Goal:** Add the actual ingestion backbone that reads `feeds.opml`, fetches feeds independently, derives stable identities, persists results atomically per feed, and emits diagnosable logs without turning partial or total feed failure into total API failure.

**Requirements:** R1, R2, R3, R5, R6, R8, R10, R12, R13, R14, R15, R16

**Dependencies:** Unit 1, Unit 2

**Files:**

- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/test/articles.e2e-spec.ts`
- Create: `apps/api/src/feeds/feeds.module.ts`
- Create: `apps/api/src/feeds/feed-bootstrap.service.ts`
- Create: `apps/api/src/feeds/feed-ingestion.service.ts`
- Create: `apps/api/src/feeds/article-identity.service.ts`
- Create: `apps/api/src/feeds/feed-bootstrap.service.spec.ts`
- Create: `apps/api/src/feeds/article-identity.service.spec.ts`
- Create: `apps/api/test/feed-ingestion.e2e-spec.ts`

**Approach:**

- Start ingestion during API startup through a lifecycle-aware bootstrap runner, but do not let feed I/O delay HTTP availability once local prerequisites have validated.
- Enforce both a per-feed network timeout and a whole-run ingestion budget. When either budget is exhausted, mark the affected feed work as failed or timed out, emit the startup summary, and keep the API available on persisted data.
- Read `feeds.opml` through the config-resolved absolute path from Unit 1, defaulting to `apps/api/feeds.opml` while allowing tests and alternative runtimes to override the path explicitly.
- Keep the implementation shape minimal for this slice: one bootstrap/orchestration service plus the identity helper is the default. Split dedicated OPML repositories, fetcher services, or shared type modules only if a second caller, trigger, or input source appears during implementation.
- Use `feedsmith` as the default parser package for both the API-owned OPML file and downstream feed parsing, and only revisit split parser packages if `feedsmith` proves insufficient in real integration.
- Implement the identity contract decided during planning: stable source id first, normalized canonical URL second, deterministic content signature third. Persist `identitySourceType`, `identitySourceValue`, and the strongest raw `sourceId` that was available for the chosen identity.
- Write each feed refresh atomically in a single feed-scoped transaction so feed metadata and article mutations for that feed commit or roll back together. This slice should not delete previously persisted articles merely because they are absent from a later fetch.
- Use `INGEST_ON_BOOT=false` and OPML path overrides in package-owned tests so unit and e2e coverage do not depend on repo-local operator files or live feeds by default.
- Emit structured logs for each feed plus a startup summary that explicitly states full success, partial success, or full failure. Once local prerequisites pass, even a `full failure` feed run should still leave the API serving previously persisted data.

**Execution note:** Start with a failing test around identity fallback order, bounded timeout behavior, and repeated-ingestion deduplication. This unit is high-risk because it touches persistence, external feeds, and startup behavior simultaneously.

**Patterns to follow:**

- `apps/api/src/main.ts`
- `apps/api/src/articles/articles.module.ts`
- NestJS lifecycle guidance from the cited official docs

**Test scenarios:**

- Happy path — a valid `feeds.opml` with multiple reachable feeds ingests feed and article rows and logs per-feed success plus a successful startup summary.
- Edge case — an item with a stable source-native id uses that id as the canonical identity input before hashing.
- Edge case — an item without a stable source-native id falls back to a normalized URL, and an item without either id or URL falls back to the planned deterministic content signature.
- Error path — one feed times out or returns malformed data, the failure is logged for that feed, the startup summary becomes partial success, and the remaining feeds are still attempted within the whole-run budget.
- Error path — missing or malformed `feeds.opml` at the resolved default path fails bootstrap clearly rather than silently starting with zero subscriptions.
- Integration — `INGEST_ON_BOOT=false` disables network bootstrap in tests while the API still initializes cleanly against the test database.
- Integration — restarting the app with unchanged feeds does not create duplicate `Article` rows for the same feed, and already-known articles keep the same public `id`.

**Verification:**

- Startup ingestion is bounded, deterministic enough for repeated local boots, per-feed failures are isolated, and once local prerequisites validate the API can keep serving persisted data even if the ingestion run later reports partial or full failure.

- [x] **Unit 4: Cut the article API over to Prisma-backed persisted reads only**

**Goal:** Replace the fixture repository with a persisted read path while preserving the existing public article contract for the web app.

**Requirements:** R4, R5, R6, R7, R9, R10, R12, R13

**Dependencies:** Unit 2, Unit 3

**Files:**

- Modify: `apps/api/src/articles/articles.module.ts`
- Modify: `apps/api/src/articles/articles.service.ts`
- Modify: `apps/api/src/articles/articles.controller.ts`
- Modify: `apps/api/src/articles/articles.controller.spec.ts`
- Create: `apps/api/src/articles/article.repository.ts`
- Create: `apps/api/src/articles/article.repository.spec.ts`
- Modify: `apps/api/test/articles.e2e-spec.ts`
- Delete: `apps/api/src/articles/article-fixture.repository.ts`
- Delete: `apps/api/src/articles/fixtures/prepared-articles.json`

**Approach:**

- Replace the fixture-backed repository with a Prisma-backed repository or query service owned by the `articles` feature.
- Keep `GET /articles` and `GET /articles/:id` response shapes unchanged so `apps/web` continues to work against the same contract.
- Use the immutable database-generated article primary key as the public `id` returned by list responses and accepted by the detail route; it must not drift when the same article is re-ingested later.
- Return `summary` as feed-provided text or an empty string when no summary-like content was persisted.
- Keep the runtime read path entirely database-backed after cutover. If ingestion partially succeeds or the latest startup fails, return whatever persisted records exist rather than ever consulting fixtures.
- Use an explicit query order for list reads so results remain stable and predictable after the move to persistence.

**Execution note:** This unit is another strong delegation candidate after Unit 3 because the external contract is already frozen and easy to validate; delegation does not change scope or acceptance criteria.

**Patterns to follow:**

- `apps/api/src/articles/articles.controller.ts`
- `apps/api/src/articles/articles.service.ts`
- `apps/web/src/widgets/article-reader/api/articles-api.ts`

**Test scenarios:**

- Happy path — `GET /articles` returns only persisted records with the existing list payload fields and no `summary`.
- Happy path — `GET /articles/:id` returns persisted detail data with `summary` populated from the database or as an empty string.
- Edge case — when the latest ingestion run only partially succeeds, previously persisted records remain readable and no fixture fallback occurs.
- Edge case — re-ingesting an already-known article preserves the same public `id` returned by the list and detail routes.
- Error path — requesting an unknown article id still returns `404`.
- Integration — removing the fixture files no longer changes runtime article reads because the API is fully backed by PostgreSQL.

**Verification:**

- The public article API remains contract-compatible for the web app, known articles keep stable public ids across repeated ingestions, and the runtime data source is now exclusively PostgreSQL-backed.

- [x] **Unit 5: Update GitHub Actions e2e to self-provision PostgreSQL 18**

**Goal:** Make CI e2e verification self-contained by having GitHub Actions provision PostgreSQL 18 inside the workflow instead of relying on any external database.

**Requirements:** R14, R17, R18

**Dependencies:** Unit 2, Unit 4

**Files:**

- Modify: `.github/workflows/pr-quality.yml`
- Modify: `apps/api/package.json`
- Modify: `apps/api/test/jest-e2e.json`
- Modify: `apps/api/test/articles.e2e-spec.ts`
- Create: `apps/api/test/ci-db-bootstrap.ts`

**Approach:**

- Update the `pr-quality / e2e` workflow so it provisions PostgreSQL 18 inside GitHub Actions, preferably as a job-local service container, instead of depending on an external database host.
- Create the CI test database inside that workflow run and inject CI-specific DB env values for the API e2e path. The local pre-created `rssift` and `rssift_test` databases remain a local-only assumption, not a CI dependency.
- Keep the workflow self-contained: database startup, health checks, schema migration/reset, and API e2e bootstrap should all happen inside the job.
- If the `pr-quality / test` gate becomes database-backed as part of this slice, mirror the same self-provisioned PostgreSQL 18 strategy there rather than reintroducing an external dependency.
- Keep the PostgreSQL 18 requirement explicit in workflow configuration and CI setup notes so the runner does not silently drift to another server version.

**Patterns to follow:**

- `.github/workflows/pr-quality.yml`
- `docs/en/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`
- `docs/zh-Hans/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`

**Test scenarios:**

- Happy path — `pr-quality / e2e` provisions PostgreSQL 18 inside the workflow, migrates the schema, and runs API-backed e2e successfully without any external database service.
- Error path — if the PostgreSQL 18 service does not become healthy, the workflow fails explicitly before e2e begins instead of hanging on application startup.
- Integration — CI injects DB env values that point only at the workflow-provisioned PostgreSQL instance, and the API e2e path does not depend on local-machine database assumptions.

**Verification:**

- GitHub-hosted e2e is self-contained, database-backed, and reproducible on a clean runner without relying on any external PostgreSQL instance.

- [x] **Unit 6: Synchronize bilingual bootstrap docs, app READMEs, and local examples**

**Goal:** Make the new ingestion workflow reproducible for operators and contributors by updating the durable docs in both languages and aligning the tracked example files with the real local startup shape.

**Requirements:** R15, R16, R17, R18, R19

**Dependencies:** Unit 1, Unit 4, Unit 5

**Files:**

- Modify: `README.md`
- Modify: `README.zh-Hans.md`
- Modify: `apps/api/README.md`
- Modify: `apps/web/README.md`
- Modify: `apps/api/.env.example`
- Modify: `apps/web/.env.example`
- Modify: `apps/api/feeds.opml.example`

**Approach:**

- Update the root bilingual READMEs to explain the new local startup path: app-owned env files, `apps/api/feeds.opml`, the already provisioned runtime and test PostgreSQL databases, and the requirement to use `psql-18` in local database guidance.
- Update the app-level READMEs so `apps/api` explains the ingestion/bootstrap workflow, the `apps/api/.env.local` convention, the `apps/api/feeds.opml` location, and the initial parser choice of `feedsmith`; `apps/web` should explain that it still only needs `API_BASE_URL` even though the API is no longer fixture-backed.
- Keep the two language trees semantically synchronized: same file locations, same DB URLs, same startup order, same `psql-18` wording, and same local ownership story for `.env.example`, `.env.local`, and `apps/api/feeds.opml`.
- Make the tracked example files truthful so contributors can bootstrap local work without inventing missing config.

**Patterns to follow:**

- `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`
- `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`
- `README.md`
- `README.zh-Hans.md`

**Test scenarios:**

- Test expectation: none -- this unit is durable documentation and tracked example synchronization rather than executable runtime behavior.

**Verification:**

- English and Simplified Chinese docs describe the same startup workflow, the example env files match the actual app ownership boundaries, and local PostgreSQL instructions consistently reference `psql-18`, `DATABASE_URL`, and `TEST_DATABASE_URL`.

## System-Wide Impact

- **Interaction graph:** API startup now crosses config loading, OPML file access, feed fetching/parsing, Prisma persistence, and article HTTP reads before the web app consumes the unchanged `/articles` contract.
- **Error propagation:** invalid app configuration or missing required `feeds.opml` should fail bootstrap clearly; individual feed failures should degrade to per-feed structured logs and a partial-success startup summary instead of process termination.
- **State lifecycle risks:** repeated boots can create duplicates unless identity derivation and database uniqueness stay aligned; partial writes can create inconsistent results unless feed/article upserts are applied deliberately.
- **API surface parity:** `GET /articles` and `GET /articles/:id` remain the only public read surfaces; `apps/web` should not need a functional contract change for this slice.
- **Integration coverage:** proving the slice requires more than unit tests: startup ingestion must populate the database, repeated startup must remain deduplicated, and the HTTP article API must read persisted results from the same database state.
- **Unchanged invariants:** this slice still does not add feed CRUD, ingestion-control endpoints, schedulers, generated summaries, auth, pagination, or filters.

## Risks & Dependencies

| Risk                                                                                                 | Mitigation                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feed sources with weak or inconsistent item identifiers could still create duplicate pressure        | Lock the fallback order in code and tests, persist `sourceId`, `identitySourceType`, and `identitySourceValue` for observability, and enforce `(feedId, identityHash)` uniqueness in PostgreSQL |
| App-owned env files could still drift from Turbo hashing and create stale cached outputs             | Update the task hashing story in `turbo.json` or app package config as part of Unit 1 instead of treating env changes as documentation-only                                                     |
| Prisma provider drift or migration-history misuse could create local/test mismatch                   | Keep PostgreSQL as the only provider, use one migration root under `apps/api/prisma/migrations/`, and avoid editing applied migrations casually                                                 |
| Startup-time network failures could be mistaken for fatal application readiness problems             | Fail hard only for invalid local prerequisites, bound the ingestion run with per-feed and whole-run budgets, and isolate per-feed operational failures in the startup summary                   |
| Tests could become coupled to local operator files, live feeds, or dirty databases                   | Add package-owned bootstrap controls, OPML path overrides, and test DB migrate/reset strategy inside `apps/api` so `test` and `test:e2e` stay reproducible                                      |
| CI e2e could still depend on an external database and drift from the intended PostgreSQL 18 baseline | Provision PostgreSQL 18 inside GitHub Actions, health-check it explicitly, and inject only workflow-owned DB env values into the e2e path                                                       |
| New package installation could trigger dependency conflicts or unreviewed version drift              | Install only into the owning workspace with `pnpm`, prefer the newest compatible stable versions, and stop if overrides or peer-conflict workarounds become necessary                           |

## Documentation / Operational Notes

- The root bilingual READMEs should be updated in the same implementation pass as the app READMEs and tracked example files.
- Local operator documentation should explicitly state that the runtime and test databases already exist as `rssift` and `rssift_test`.
- `psql-18` must be the documented local database client across durable docs and verification notes.
- The OPML-facing docs should link directly to the OPML 2.0 specification and explain that the API-owned local file is `apps/api/feeds.opml`.
- The plan should not require a production deployment topology change; the slice only needs a single-instance PostgreSQL assumption suitable for one self-hosted operator.
- If implementation adds local-only env files or `feeds.opml`, keep them owned under `apps/api/` or the relevant app instead of normalizing them as root-level runtime config.
- CI notes should explicitly say that GitHub-hosted e2e provisions PostgreSQL 18 inside the workflow and does not depend on the local pre-created databases.

## Sources & References

- **Origin documents:** `docs/en/brainstorms/2026-04-15-v0-1-slice-2-feed-ingestion-requirements.md` + `docs/zh-Hans/brainstorms/2026-04-15-v0-1-slice-2-feed-ingestion-requirements.md`
- **Related prior plan:** `docs/en/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md` + `docs/zh-Hans/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md`
- **Current read-path seam:** `apps/api/src/articles/article-fixture.repository.ts`
- **Current article service:** `apps/api/src/articles/articles.service.ts`
- **Current web API client:** `apps/web/src/widgets/article-reader/api/articles-api.ts`
- **Institutional learnings:**
  - `docs/en/solutions/developer-experience/root-pnpm-typecheck-uses-turbo-workspace-coverage-2026-04-13.md`
  - `docs/zh-Hans/solutions/developer-experience/root-pnpm-typecheck-uses-turbo-workspace-coverage-2026-04-13.md`
  - `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`
  - `docs/zh-Hans/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`
  - `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`
  - `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`
