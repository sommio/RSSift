# First Vertical Slice Reader

This app renders the first runnable reader slice for the repository. It consumes
the persisted `apps/api` article contract over real HTTP and presents a
two-pane reading shell on port `3001`. It imports generated contract types and
helpers from `@repo/api-contract`, so the web side no longer owns handwritten
DTO-like contract shapes.

The current reader contract is summary-first:

- the article rail prefers `translatedTitle` and falls back to the original
  `title` when the prepared translation is still missing
- the detail pane renders canonical Markdown summary content directly
- an empty prepared `summary` renders either the persisted
  `summaryErrorReason` or the pending-state copy `Summary pending` while
  keeping the rest of the reader chrome visible

The checked-in OpenAPI document is the source of truth for that contract. The
web seam stays thin and only handles `API_BASE_URL`, cache policy, URL
encoding, and the `404 -> null` reader fallback.

## Local Development

1. Start the API in a separate terminal:

```bash
pnpm --dir apps/api dev
```

2. Copy the example env file if you need a local override:

```bash
cp apps/web/.env.example apps/web/.env.local
```

3. Start the web app:

```bash
pnpm --dir apps/web dev
```

The web package now bootstraps `@repo/ui` before `dev`, and bootstraps both `@repo/ui` plus `@repo/jest-config` before `build`, `typecheck`, and `test`, so a clean checkout only needs `pnpm install` first. You do not need pre-existing `packages/ui/dist` or `packages/jest-config/dist` directories.
It also bootstraps `@repo/api-contract` before `dev`, `build`, `lint`,
`typecheck`, and `test`, so the generated contract package stays in sync with
the web app entrypoints.

The local default contract is:

- Web: `http://127.0.0.1:3001`
- API: `http://127.0.0.1:3000`
- `API_BASE_URL=http://127.0.0.1:3000`

The web app does not own any database settings. It still only needs
`API_BASE_URL`; `apps/api` owns feed ingestion, Prisma, PostgreSQL, and
`feeds.opml`.

## Compose / VPS Deployment Contract

The repo root owns the Docker Compose deployment entrypoint. This package keeps
its own image build logic in `apps/web/Dockerfile`, but operators should not
configure production by entering `apps/web` directly.

In the Compose deployment path:

- repo-root `compose.yaml` builds `apps/web/Dockerfile` from the repo root
  context
- `API_BASE_URL` is set to `http://api:3000`
- the browser still talks only to Caddy/Web; the web server performs the
  server-to-server API fetch
- `/api/health` is the dedicated probe endpoint for Compose and Caddy

This means the production `API_BASE_URL` is an internal service DNS name, not a
host loopback URL and not a browser-visible public API origin.

## Validation

Run the web quality checks:

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
```

Direct Jest invocations also resolve `@repo/ui` from `packages/ui/src`, which keeps ad-hoc test runs safe even when `packages/ui/dist` has not been built yet.
The contract package stays in the normal workspace graph, so generated types are
available without manual copying.

Run the browser flow against both apps:

```bash
pnpm --filter web test:e2e
```

The Playwright suite starts both the API and the web app, then verifies:

- the first article is selected by default
- selecting another article updates the URL with `articleId`
- refreshing preserves the same selected article
- a stale `articleId` renders the unavailable state while the list stays visible
- translated-title fallback and canonical Markdown summaries survive the full
  API-to-web seam
- `/api/health` stays available as a stable, dependency-light probe surface

## Contract Refresh

- Refresh the API OpenAPI file with `pnpm --filter api contract:refresh`.
- Regenerate the client/types with `pnpm --filter @repo/api-contract contract:refresh`.
- Do not hand-edit the reader contract shape in
  `apps/web/src/widgets/article-reader/api/articles-api.ts`.

## Shared UI Boundary

Reusable shadcn/Tailwind primitives live in `packages/ui`. App-specific reader data loading and composition stay in `apps/web`.
