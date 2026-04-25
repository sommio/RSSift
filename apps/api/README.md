# API

This app owns the PostgreSQL-backed feed ingestion backbone for the repository.
It reads `apps/api/feeds.opml`, ingests feeds on boot with best-effort
isolation, attempts article body extraction during ingestion, and serves the
existing read-only `/articles` and health contracts from persisted data.

## Local Run

1. Create the local API inputs first:

```bash
cp apps/api/.env.example apps/api/.env.local
cp apps/api/feeds.opml.example apps/api/feeds.opml
```

2. Review `apps/api/.env.local` before starting the app:

- `DATABASE_URL` is the development database used by the API runtime and by
  `db:deploy`, `db:reset`, and `db:seed`.
- `TEST_DATABASE_URL` is reserved for automated tests.
- `FEED_AUTO_REFRESH_INTERVAL_HOURS` defaults to `6`; after same-process
  wake/resume events, the API only runs a background refresh when the last
  successful wake-driven refresh is older than this interval.
- `FEED_MAX_ARTICLES_PER_FEED` defaults to `10`; each feed ingestion run only
  persists the newest N entries from that feed.
- `FEED_OPML_PATH` defaults to `./feeds.opml`.
- `INGEST_ON_BOOT=true` enables startup-time ingestion for local API runs.
- `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` enable prepared-summary
  generation through an OpenAI-compatible gateway.
- `LLM_SUMMARY_CONCURRENCY` defaults to `2` so the summary worker pool stays
  small but avoids a single blocked request stalling the whole backlog.
- `LLM_SUMMARY_LANGUAGE` defaults to `zh-CN`.
- `LLM_TIMEOUT_MS` is optional; leave it empty to use the SDK default timeout.

3. Verify the local databases with `psql-18`:

```bash
psql-18 postgresql://rssift:rssift@127.0.0.1:5432/rssift -c 'select current_database();'
psql-18 postgresql://rssift:rssift@127.0.0.1:5432/rssift_test -c 'select current_database();'
```

4. Apply the checked-in Prisma migrations to the development database:

```bash
pnpm --filter api db:deploy
```

5. Optionally load the deterministic development seed:

```bash
pnpm --filter api db:seed
```

6. Start the API:

```bash
pnpm --filter api dev
```

The API runs on `http://127.0.0.1:3000` by default.

`pnpm --filter api dev`, `pnpm --filter api start`, and `pnpm --filter api start:prod` no longer apply migrations automatically. Run a package-local Prisma migration command yourself whenever the schema needs to change.

## Compose / VPS Deployment Boundary

This package still owns the API runtime contract, Prisma migrations, and the
single-process Nest runtime. The repo root now owns the production Compose
entrypoint.

Production Compose uses:

- repo-root `.env` for operator-owned deployment inputs
- repo-root `compose.yaml` as the only supported VPS entrypoint
- repo-root `Caddyfile` as the reverse-proxy entry
- `api-migrate` to run `pnpm db:deploy` once before the long-lived `api`
  container starts
- an operator-provided host `feeds.opml` path mounted read-only into the API
  container

Local development still uses:

- `apps/api/.env.local`
- `apps/api/feeds.opml`
- package-local commands such as `pnpm --filter api dev` and
  `pnpm --filter api db:deploy`

For Compose deployments, `FEED_OPML_PATH` points at the mounted absolute path
inside the container instead of the app-local default `./feeds.opml`.

## Runtime Ownership

- `apps/api/.env.local` owns `DATABASE_URL`, `TEST_DATABASE_URL`,
  `FEED_AUTO_REFRESH_INTERVAL_HOURS`, `FEED_MAX_ARTICLES_PER_FEED`,
  `FEED_OPML_PATH`, `INGEST_ON_BOOT`, `LLM_BASE_URL`, `LLM_API_KEY`,
  `LLM_MODEL`, `LLM_SUMMARY_CONCURRENCY`, `LLM_SUMMARY_LANGUAGE`, optional
  `LLM_TIMEOUT_MS`, and `PORT`.
- `apps/api/feeds.opml` is the app-owned local subscription input.
- Feed parsing uses `feedsmith`.
- Article body extraction uses `@mozilla/readability`, `jsdom`, and `turndown`
  inside `apps/api`.
- Prepared summaries use the official `openai` SDK against the configured
  OpenAI-compatible gateway, validate the structured result with `zod`, and
  persist canonical Markdown, `translatedTitle`, and any terminal failure reason
  in `summaryError`.
- Same-process sleep/freeze recovery is allowed to trigger a background feed
  auto-refresh in the future, but `INGEST_ON_BOOT` remains startup-only; the
  wake interval is an elapsed-hours check, not a cron schedule.
- Wake auto-refresh is explicitly single-process only. It dedupes overlapping
  resume events inside one Node process, but it is not a distributed lock for
  multi-replica deployments.
- The Docker Compose production path keeps that same single-process assumption;
  this app is not ready for multi-replica ingestion.
- Historical rows with `contentMarkdown` and empty summary fields are picked up
  by an internal bootstrap backfill; there is no public regenerate endpoint.
- Prisma schema, migrations, and generated client stay inside `apps/api`.

## Endpoints

- `GET /articles`
  - Returns article list items with fields:
    - `id`
    - `title`
    - `translatedTitle`
    - `sourceTitle`
    - `publishedAt`
    - `originalUrl`
- `GET /articles/:id`
  - Returns article detail with fields:
    - `title`
    - `translatedTitle`
    - `sourceTitle`
    - `publishedAt`
    - `summary`
    - `summaryError`
    - `originalUrl`
  - Returns `404` for unknown article IDs.

Article body markdown stays internal in this slice. The public `GET /articles`
and `GET /articles/:id` payloads expose the original `title`, the prepared
`translatedTitle`, the canonical Markdown `summary`, and any persisted
`summaryError`, but they still never expose `contentMarkdown` or
`contentExtractedAt`.

## Validation

```bash
pnpm --filter api db:generate
pnpm --filter api db:migrate
pnpm --filter api db:deploy
pnpm --filter api db:reset
pnpm --filter api db:seed
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api contract:refresh
```

Use `pnpm --filter api db:deploy` to align the local development database with
the checked-in migration history. Reserve `pnpm --filter api db:migrate` for
authoring a new migration locally.
Use `pnpm --filter api db:reset` when you need a clean development schema with
migrations re-applied, and `pnpm --filter api db:seed` when you want the
deterministic sample data set. All of those commands target the development
database behind `DATABASE_URL`. The test programs handle the test database
through `TEST_DATABASE_URL` internally instead of exposing separate
developer-facing test-database commands.

Local development startup is explicit: `pnpm dev` and `pnpm --filter api dev`
do not apply Prisma migrations for you. Run `pnpm --filter api
db:deploy` yourself before booting Nest if the local database schema is
behind.

## Auto-Refresh Logging

- `feed_auto_refresh` emits `skipped` with reasons such as
  `interval_not_elapsed` and `already_running`, plus `triggered`,
  `partial_success`, `all_success`, and `full_failure`.
- `feed_ingestion_summary` also carries a `trigger` field so operators can
  distinguish `bootstrap` runs from `auto_refresh_resume` runs in downstream
  logs.

## Test Surfaces

- Colocated specs stay next to the feature code in `apps/api/src/**/*.spec.ts`.
- App-level HTTP and database suites live in `apps/api/e2e`.
- Shared API-only test helpers that are reused outside e2e live in
  `apps/api/test-support`.
- `pnpm --filter api test` remains the package-local unit/integration entry.
- `pnpm --filter api test:e2e` remains the package-local app-level e2e entry.
- `GET /health/live` reports process liveness for orchestration probes.
- `GET /health/ready` reports readiness only when bootstrap has completed and
  the database ping succeeds.

## OpenAPI Contract

- `apps/api/src/openapi/openapi-refresh.ts` refreshes the checked-in contract at
  `packages/api-contract/openapi/openapi.yaml`.
- `packages/api-contract` generates the client/types that `apps/web` imports.
- Use `pnpm --filter api contract:refresh` first, then
  `pnpm --filter @repo/api-contract contract:refresh` when the API surface
  changes.
