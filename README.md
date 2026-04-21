# RSSift

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-Hans.md">中文</a>
</p>

RSSift is a Turborepo-based monorepo for an AI-assisted RSS filtering tool.
It is intentionally scoped around a feed-triage workflow: pull feeds, generate
summaries, present a two-column desktop view, and jump to the original article
when needed.

## Current status

- The project is in agile, iterative development.
- The first end-to-end slice is implemented as the current working slice.
- `apps/api` now ingests feeds into PostgreSQL on boot and serves persisted
  article list and detail endpoints.
- `apps/api` now also attempts best-effort article body extraction during
  ingestion and stores markdown internally for later summarization work.
- `apps/web` renders the reader UI and consumes the API over HTTP.
- Shared UI primitives live in `packages/ui`.

## Project direction

- This project is a filter-first RSS workflow, not a full-featured reader.
- The current focus is article triage, summary generation, and jump-out to the
  original source.
- The current implementation is being improved through agile, iterative
  delivery.

## Requirements

- Node.js 24.14.1 or later
- pnpm 10.33.0 or later

## Run locally

1. Create the app-local environment files first:

```bash
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
cp apps/api/feeds.opml.example apps/api/feeds.opml
```

2. Review and edit the local environment values before booting anything:

- `apps/api/.env.local`
  - `DATABASE_URL` is the development database used by `db:deploy`,
    `db:reset`, `db:seed`, and normal API runtime reads/writes.
  - `TEST_DATABASE_URL` is reserved for automated test flows only.
  - `FEED_OPML_PATH` defaults to `./feeds.opml`.
  - `INGEST_ON_BOOT=true` enables startup-time ingestion for local API runs.
- `apps/web/.env.local`
  - `API_BASE_URL` should point to the local API, usually
    `http://127.0.0.1:3000`.

3. Install dependencies:

```bash
pnpm install
```

4. Verify the local PostgreSQL 18 prerequisites with `psql-18`:

```bash
psql-18 postgresql://rssift:rssift@127.0.0.1:5432/rssift -c 'select current_database();'
psql-18 postgresql://rssift:rssift@127.0.0.1:5432/rssift_test -c 'select current_database();'
```

Expected local databases:

- `DATABASE_URL=postgresql://rssift:rssift@127.0.0.1:5432/rssift`
- `TEST_DATABASE_URL=postgresql://rssift:rssift@127.0.0.1:5432/rssift_test`

5. Apply the checked-in Prisma migrations to the development database:

```bash
pnpm --filter api db:deploy
```

6. Optionally load the deterministic development seed data:

```bash
pnpm --filter api db:seed
```

7. Start the API in one terminal:

```bash
pnpm --filter api dev
```

8. Start the web app in another terminal:

```bash
pnpm --filter web dev
```

The default local URLs are:

- API: `http://127.0.0.1:3000`
- Web: `http://127.0.0.1:3001`

The repo-root `.env` and `compose.yaml` are not part of the local app-dev path.
They are the operator-facing deployment entry for self-hosted Docker Compose.

## Self-host on a VPS

Repo-root `compose.yaml`, repo-root `.env`, and repo-root `Caddyfile` are the
production deployment surface. This is intentionally a root-level entrypoint so
an operator can clone the repo and start the whole stack from one obvious place
without dropping into a secondary `deploy/` directory.

### Prerequisites

- Docker Engine with the Compose plugin installed on the VPS
- A host-level OPML file path that the operator owns and backs up
- Inbound network access for the published Caddy HTTP port

### Prepare the operator inputs

1. Copy the root deployment env file:

```bash
cp .env.example .env
```

2. Edit the root `.env`:

- `HTTP_PORT` controls the host port published by Caddy's HTTP listener.
- `POSTGRES_*` owns the Compose-managed PostgreSQL credentials and database.
- `FEED_OPML_HOST_PATH` must point to an existing host file path. Compose binds
  it into the API container as a read-only file.
- `INGEST_ON_BOOT` and the `LLM_*` values remain explicit operator-owned
  runtime inputs for the API service.

### Build and start the stack

```bash
docker compose up -d --build
```

This root stack starts:

- `postgres` on the Compose network only
- `api-migrate` as the one-shot Prisma migration gate
- `api` as the single-process Nest runtime
- `web` as the Next.js runtime with `API_BASE_URL=http://api:3000`
- `caddy` as the only public entrypoint

### Validate the deployment

```bash
docker compose ps
docker compose logs --tail=100 api-migrate api web caddy
curl http://127.0.0.1:${HTTP_PORT:-80}/
curl http://127.0.0.1:${HTTP_PORT:-80}/api/health
docker compose exec api node -e "fetch('http://127.0.0.1:3000/health/ready').then((response) => response.text().then((body) => { console.log(response.status, body); process.exit(response.ok ? 0 : 1); })).catch((error) => { console.error(error); process.exit(1); })"
```

Healthy expectations:

- `api-migrate` exits successfully once
- `api` reports `200` on `/health/live` and `/health/ready`
- `web` reports `200` on `/api/health`
- external traffic reaches `caddy`, which reverse-proxies only to `web`

Operational rules for this first deployment path:

- PostgreSQL stays private to the Compose network by default
- only Caddy publishes host ports
- the API remains a single-process deployment target
- `feeds.opml` stays operator-owned on the host and is never baked into images
- root `.env` is for deployment only; app-local `.env.local` files remain the
  development entry for `apps/api` and `apps/web`

## Local quality checks

After `pnpm install`, Husky installs the repository's local Git hooks automatically.

- `pre-commit` runs `pnpm lint:staged`: staged JS/TS files are formatted with Prettier and linted with ESLint, while staged CSS/HTML/JSON/Markdown files are formatted with Prettier only.
- `pre-push` runs `pnpm typecheck`, which reuses the existing workspace typecheck gate.
- Local hooks do not run `pnpm test:e2e`.
- `pre-push` can be slower than `pre-commit` because the current Turborepo task graph may run upstream `build` prerequisites before `typecheck`.

If a hook fails, fix the reported issues and rerun the same Git command. You can also run the checks manually:

```bash
pnpm lint:staged
pnpm typecheck
```

## Useful commands

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

Development-database Prisma helpers live in `apps/api`:

```bash
pnpm --filter api db:generate
pnpm --filter api db:migrate
pnpm --filter api db:deploy
pnpm --filter api db:reset
pnpm --filter api db:seed
```

These commands target the development database behind `DATABASE_URL`.
Use `db:deploy` to apply checked-in migrations, `db:migrate` only when you are
authoring a new migration, `db:reset` to rebuild the development database from
migrations, and `db:seed` to load the deterministic sample data set. Automated
tests handle the test database internally through `TEST_DATABASE_URL`; those
test-database operations are intentionally not exposed as developer-facing
commands.

Article body storage is now part of the normal ingestion lifecycle rather than a
manual script. If one persisted article needs a repair pass, use the narrow API
endpoint:

```bash
curl -X POST http://127.0.0.1:3000/article-content/<article-id>/retry
```

That endpoint is a secondary repair path only. The public article read APIs
still do not expose stored markdown in this slice.

`pnpm dev` at the repo root no longer applies Prisma migrations implicitly. Run
an explicit API migration command before starting the dev servers whenever your
local schema is behind:

```bash
pnpm --filter api db:deploy
pnpm dev
```

## PR Quality Workflow

- GitHub Actions runs a PR-only quality workflow on `pull_request`.
- Configure branch protection against these stable job names:
  - `pr-quality / format`
  - `pr-quality / static`
  - `pr-quality / test`
  - `pr-quality / e2e`
- Docs-only pull requests still report those four jobs, but they complete as
  explicit no-op successes so required checks never stay pending.
- Code pull requests always run full `pnpm format:check` and full
  `pnpm test:e2e`.
- App-local pull requests can use `turbo run lint --affected`,
  `turbo run typecheck --affected`, and `turbo run test --affected` for the
  static and unit/integration gates. Any shared package, root config, workflow,
  or lockfile change falls back to full-repo execution.
- Database-backed `pr-quality / test` and `pr-quality / e2e` provision their
  own PostgreSQL 18 service containers inside the workflow and create temporary
  CI databases before running validation.
- To enable Turbo remote cache on trusted same-repository pull requests, set
  GitHub Actions secrets `TURBO_TOKEN` and `TURBO_TEAM`. Forks and automated
  pull requests without those secrets intentionally run uncached instead of
  weakening the quality gates.
- No additional operational monitoring required for this workflow rollout
  because it only adds pull request validation and does not change runtime
  production behavior.
