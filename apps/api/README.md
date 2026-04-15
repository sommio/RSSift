# API

This app owns the PostgreSQL-backed feed ingestion backbone for the repository.
It reads `apps/api/feeds.opml`, ingests feeds on boot with best-effort
isolation, and serves the existing read-only `/articles` contract from
persisted data.

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
- `FEED_OPML_PATH` defaults to `./feeds.opml`.
- `INGEST_ON_BOOT=true` enables startup-time ingestion for local API runs.

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

## Runtime Ownership

- `apps/api/.env.local` owns `DATABASE_URL`, `TEST_DATABASE_URL`,
  `FEED_OPML_PATH`, `INGEST_ON_BOOT`, and `PORT`.
- `apps/api/feeds.opml` is the app-owned local subscription input.
- Feed parsing uses `feedsmith`.
- Prisma schema, migrations, and generated client stay inside `apps/api`.

## Endpoints

- `GET /articles`
  - Returns article list items with fields:
    - `id`
    - `title`
    - `sourceTitle`
    - `publishedAt`
    - `originalUrl`
- `GET /articles/:id`
  - Returns article detail with fields:
    - `title`
    - `sourceTitle`
    - `publishedAt`
    - `summary`
    - `originalUrl`
  - Returns `404` for unknown article IDs.

## Validation

```bash
pnpm --filter api db:generate
pnpm --filter api db:migrate
pnpm --filter api db:deploy
pnpm --filter api db:reset
pnpm --filter api db:seed
pnpm --filter api test
pnpm --filter api test:e2e
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
