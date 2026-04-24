---
date: 2026-04-24
topic: developer-efficiency-friction
focus: repository-wide tracked-file scan, excluding .agents/skills
---

# Ideation: Developer Efficiency Friction

## Codebase Context

This pass is grounded in `git ls-files`, with `.agents/skills/**` excluded.
The scanned tracked surface contains 255 files: 112 under `apps/`, 75 under
`docs/`, 28 under `packages/`, 17 under `.github/`, plus root tooling and
operator files.

Project shape:

- Turborepo monorepo with `apps/api`, `apps/web`, and shared packages.
- `apps/api` is NestJS + Prisma + PostgreSQL. It owns feed ingestion,
  article-content extraction, LLM summary generation, health checks, and the
  `/articles` read API.
- `apps/web` is Next.js App Router. It renders the article reader and fetches
  the API over `API_BASE_URL` from a server component path.
- `packages/ui`, `packages/eslint-config`, `packages/jest-config`, and
  `packages/typescript-config` provide shared UI and tool configuration.
- Durable docs are bilingual under `docs/en/` and `docs/zh-Hans/`.

Grounding signals:

- `apps/web/src/widgets/article-reader/api/articles-api.ts` defines web-side
  API types by hand and trusts `response.json()` through casts.
- `apps/api/src/articles/dto/*.ts` defines separate DTO classes without a
  shared runtime contract or generated client.
- `apps/api/e2e/articles.e2e-spec.ts` protects shape by key assertions, but
  test helpers still cast `unknown` bodies into DTO types.
- `apps/api/src/feeds/feed-ingestion.service.ts` is 494 lines and owns OPML
  traversal, feed HTTP, parsing, identity, persistence, enrichment scheduling,
  retry, budgets, and logging.
- `apps/api/src/article-summary/article-summary.service.ts` owns an in-memory
  queue, concurrency, dedupe, retry timing, persistence transitions, and logs.
- `turbo.json` uses repo-wide `globalDependencies` and `globalEnv` for all
  tasks, including runtime env variables and local env files.
- `apps/web/playwright.config.ts` embeds a long e2e setup command that builds
  the API, resets migrations, seeds, and starts both apps inline.
- `apps/api/README.md` and `apps/web/README.md` still mention the old public
  `summaryErrorReason` contract, while current code exposes structured
  `summaryError` instead.
- Existing solution docs are bilingual, but solution category directories now
  include `best-practices`, `logic-errors`, and `ui-bugs` even though the
  current `AGENTS.md` taxonomy lists a narrower preferred set.

Past learnings already present in the repo:

- Root `pnpm typecheck` must be treated as Turbo workspace coverage, not root
  `tsc` coverage.
- CI e2e stability depends on one seeded database target per suite and env
  consistency across build and start phases.
- Feed ingestion must keep article-content and summary enrichment on the
  canonical ingestion pipeline.
- Retryable summary failures must preserve existing readable summaries until
  retries are exhausted.
- Repo-root Compose is the operator contract and should stay HTTP-only for the
  current self-hosted path.

## Ranked Ideas

### 1. Move the Web/API read seam to a shared contract or tRPC

**Description:** Replace the hand-written web contract in
`apps/web/src/widgets/article-reader/api/articles-api.ts` with a repo-owned
contract. The strongest direction is a tRPC-backed API layer for app-internal
reads, or a schema-first shared package if Nest REST must remain public. Either
path must remove unchecked `response.json() as T` and make payload validation or
inference come from the same source as the backend implementation.

**Rationale:** This is the highest-leverage future-DX issue. The current seam
looks typed but is not contract-safe: backend DTO classes, web types, and e2e
shape checks can drift independently. Every new reader field or error state now
requires synchronized manual edits across API DTOs, service mapping, web types,
UI tests, and e2e assertions.

**Downsides:** High migration cost. tRPC plus Nest needs a deliberate boundary
choice, not a casual package install. A schema-first REST client would be less
invasive but also less complete.

**Confidence:** 96%

**Complexity:** High

**Status:** Unexplored

### 2. Make Turbo caching task-specific instead of globally env-sensitive

**Description:** Rework `turbo.json` so runtime env and local env files only
hash tasks that actually consume them. Keep workspace task ownership intact,
but move from broad `globalEnv` / `globalDependencies` toward task-level `env`
and `inputs` for build, e2e, API tests, and deployment-sensitive tasks.

**Rationale:** Today all tasks inherit `API_BASE_URL`, `DATABASE_URL`, `LLM_*`,
`TEST_DATABASE_URL`, and `**/.env.*local` as global cache inputs. That is safe
but expensive: a local env edit can invalidate lint/typecheck paths that do not
need the runtime value. This slows iteration and makes cache misses harder to
explain.

**Downsides:** Requires careful task-by-task audit. If under-scoped, e2e or
build tasks can get stale cache hits. Needs tests or `turbo --summarize`
evidence before landing.

**Confidence:** 90%

**Complexity:** Medium

**Status:** Unexplored

### 3. Build a first-class local DB and e2e harness

**Description:** Add a single developer-facing command or helper that provisions
PostgreSQL, applies the right migrations, seeds the right target, and runs API
or web e2e without relying on tribal knowledge. Keep one reset owner per suite
and make database target selection explicit.

**Rationale:** The repo already has institutional knowledge about database target
drift. Current tests still require a real local PostgreSQL and repeat env setup
in multiple specs. `apps/web/playwright.config.ts` also embeds setup inline.
Future contributors will lose time on connection, migration, and seed mismatch
before they touch product code.

**Downsides:** Needs care not to stack Prisma reset with the custom reset helper
again. A containerized path may add runtime cost if not kept opt-in.

**Confidence:** 88%

**Complexity:** Medium

**Status:** Unexplored

### 4. Split feed ingestion into explicit pipeline stages

**Description:** Refactor `FeedIngestionService` into smaller stage-owned units:
OPML subscription loading, feed fetching, feed parsing normalization, article
identity, persistence diffing, enrichment dispatch, and run logging. Preserve
the current canonical ingestion path and tests while making boundaries visible.

**Rationale:** `feed-ingestion.service.ts` is the current hotspot for future
features. It coordinates time budgets, retries, parsing, DB writes, content
extraction, and summary refresh. That concentration makes every change risky:
freshness, repair, identity, and enrichment all share one large mutation path.

**Downsides:** Refactor risk is real because this file protects several prior
bug fixes. It should be split behind characterization tests, not rewritten in
one broad move.

**Confidence:** 87%

**Complexity:** High

**Status:** Unexplored

### 5. Give summary generation a durable job boundary

**Description:** Move `ArticleSummaryService` from an in-memory queue toward a
small durable job model, or at least isolate the queue behind a job-runner
interface with explicit lifecycle metrics. The first step can stay single
process, but the boundary should stop spreading retry and dedupe semantics
through feature code.

**Rationale:** Current summary scheduling uses arrays, `Set`, and `setTimeout`
inside the service. That was pragmatic for v0.1, but it makes restart recovery,
observability, retry inspection, and future multi-process behavior difficult.
The repo already documents that Compose is single-process; that assumption is a
known future ceiling.

**Downsides:** A full queue system would be overkill today. The right first move
is likely a minimal durable state table or adapter seam, not BullMQ by default.

**Confidence:** 84%

**Complexity:** High

**Status:** Unexplored

### 6. Add a docs-contract drift gate for durable docs

**Description:** Add a small repo-owned check that catches stale public contract
terms in durable docs. Initial rules should flag `summaryErrorReason` in app
READMEs when current API docs or DTOs expose `summaryError`, verify bilingual
counterparts, and alert when docs reference removed endpoints.

**Rationale:** Current `apps/api/README.md` and `apps/web/README.md` still
communicate the old summary error surface. That misleads future development and
review. The repo already treats docs as durable paired artifacts, so a small
drift check fits the existing workflow.

**Downsides:** Keyword checks can create false positives in historical plans and
brainstorms. Scope should start with current README/operator docs rather than
all archived planning material.

**Confidence:** 91%

**Complexity:** Low

**Status:** Unexplored

### 7. Centralize env schema, examples, and docs generation

**Description:** Define runtime env contracts in one schema per app/deployment
surface and generate or validate `.env.example`, README tables, Compose env
coverage, and `turbo.json` env references from that source.

**Rationale:** Env variables are spread across `apps/api/src/config`, app-local
`.env.example`, root `.env.example`, Compose, Playwright, CI, and docs. The API
validation is custom even though `zod` is already present. Future env changes
will otherwise keep requiring manual synchronized edits.

**Downsides:** Generated docs can become noisy if the schema is too abstract.
Keep the first version narrow: validation plus consistency checks before full
README generation.

**Confidence:** 86%

**Complexity:** Medium

**Status:** Unexplored

### 8. Extract Playwright/e2e orchestration from inline shell strings

**Description:** Move the long `apps/web/playwright.config.ts` webServer command
into package scripts or a checked helper script. Keep the same env contract, but
make build, reset, seed, API start, and web start separately readable and
reusable from local debugging and CI.

**Rationale:** The current inline command is hard to inspect, quote, reuse, or
change safely. It also hides the same database setup decisions that previous CI
e2e failures depended on. A script with unit coverage would make future e2e
changes cheaper.

**Downsides:** Another helper script can become indirection if it only wraps one
command. The value comes from naming the phases and testing env propagation.

**Confidence:** 83%

**Complexity:** Low

**Status:** Unexplored

### 9. Normalize solution-doc taxonomy or update the governing rule

**Description:** Decide whether solution categories are intentionally broader
than the current `AGENTS.md` list. Either update `AGENTS.md` to include existing
`best-practices`, `logic-errors`, and `ui-bugs`, or migrate/alias categories
back to the documented set. Preserve bilingual parity.

**Rationale:** The actual docs tree is paired and healthy, but category policy
and existing categories now diverge. That creates routing friction when future
`ce:compound` or docs cleanup work needs to place a learning.

**Downsides:** Low technical risk, but taxonomy churn can create review noise.
Prefer a small policy clarification before moving files.

**Confidence:** 79%

**Complexity:** Low

**Status:** Unexplored

### 10. Put untyped third-party feed parsing behind validated adapters

**Description:** Wrap `feedsmith` OPML/feed item access in adapter functions that
return validated internal shapes. Use a schema or typed normalization layer so
`Record<string, unknown>` casts stay inside one boundary.

**Rationale:** Feed parsing currently relies on several casts in
`feed-ingestion.parsers.ts` and OPML traversal. That is acceptable at an
external input boundary, but future feed-format support will be easier if the
rest of ingestion consumes a known internal shape.

**Downsides:** This should not become a full feed parser rewrite. The goal is to
contain unknown input, not replace `feedsmith`.

**Confidence:** 78%

**Complexity:** Medium

**Status:** Unexplored

### 11. Refine PR quality scope for packages and shared config

**Description:** Extend `.github/scripts/pr-quality-scope.mjs` so package-only
or shared-config-only changes can take a safe affected path when the dependency
graph proves coverage. Keep conservative full-run fallback for root, workflow,
lockfile, and unknown changes.

**Rationale:** The classifier currently treats `apps/*` as the only app-local
fast path. That was safe for v0.1, but the repo now has meaningful packages for
UI, Jest, ESLint, and TypeScript config. As packages grow, full-run-only CI for
all package edits will become slower than necessary.

**Downsides:** False negatives are worse than slow CI. This needs tests for
package dependents and should default to full when dependency impact is unclear.

**Confidence:** 76%

**Complexity:** Medium

**Status:** Unexplored

### 12. Add explicit package-boundary checks before the monorepo grows

**Description:** Introduce a lightweight boundary guard for cross-package imports
and generated-source imports. This can be Turborepo boundaries, ESLint import
rules, or a small repo-owned script, but it should encode the current `apps/`
versus `packages/` ownership rules.

**Rationale:** The monorepo is still small, so boundaries are mostly held by
convention. That will not scale once more shared code appears. Encoding the
boundary now prevents future imports from reaching across app internals or
leaning on generated Prisma output outside `apps/api`.

**Downsides:** Boundary tooling can be noisy if introduced too broadly. Start
with report-only checks or high-signal forbidden patterns.

**Confidence:** 73%

**Complexity:** Medium

**Status:** Unexplored

## Rejection Summary

| #   | Idea                                                  | Reason Rejected                                                                       |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | OpenAPI-only client generation                        | Weaker duplicate of the shared contract/tRPC idea for this internal monorepo seam.    |
| 2   | Rewrite into microservices                            | Too expensive and contradicts current single-process product shape.                   |
| 3   | Re-add a public article-content retry endpoint        | Conflicts with the established read-only public surface.                              |
| 4   | Add `apps/web/src/pages` for FSD purity               | Conflicts with current Next.js App Router rule.                                       |
| 5   | NPM publishing workflow                               | Not a developer-efficiency blocker for the current product release model.             |
| 6   | Immediate distributed locking for all jobs            | Better treated as a later durable-job variant, not a first ideation survivor.         |
| 7   | Replace Prisma with raw SQL                           | Not grounded in current pain; Prisma is the repo's actual persistence contract.       |
| 8   | Move Compose into an app package                      | Contradicts the repo-root operator contract already documented.                       |
| 9   | English-only docs cleanup                             | Violates the bilingual durable-doc policy.                                            |
| 10  | Full feed parser replacement                          | Too broad; validated adapters solve the observed problem with less churn.             |
| 11  | Visual redesign of the reader                         | Product-facing, not primarily a future developer-efficiency issue.                    |
| 12  | Mine GitHub issues                                    | Not requested; this pass is grounded in tracked repo contents.                        |
| 13  | Commit hooks for every possible check                 | Duplicates existing Husky/lint-staged flow and would slow local commits.              |
| 14  | Hard-delete historical plans mentioning old contracts | Historical docs should remain archival; drift gates should target current docs first. |

## Session Log

- 2026-04-24: Initial ideation from tracked-file scan. Generated 26 candidate
  ideas across contract safety, task graph, test harness, pipeline structure,
  docs drift, and monorepo boundaries. Kept 12, rejected 14.
