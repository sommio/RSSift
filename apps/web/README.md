# First Vertical Slice Reader

This app renders the first runnable reader slice for the repository. It consumes
the persisted `apps/api` article contract over real HTTP and presents a
two-pane reading shell on port `3001`.

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

The web package now bootstraps `@repo/ui` before `dev`, `build`, `typecheck`, and `test`, so a clean checkout only needs `pnpm install` first. You do not need a pre-existing `packages/ui/dist` directory.

The local default contract is:

- Web: `http://127.0.0.1:3001`
- API: `http://127.0.0.1:3000`
- `API_BASE_URL=http://127.0.0.1:3000`

The web app does not own any database settings. It still only needs
`API_BASE_URL`; `apps/api` owns feed ingestion, Prisma, PostgreSQL, and
`feeds.opml`.

## Validation

Run the web quality checks:

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
```

Direct Jest invocations also resolve `@repo/ui` from `packages/ui/src`, which keeps ad-hoc test runs safe even when `packages/ui/dist` has not been built yet.

Run the browser flow against both apps:

```bash
pnpm --filter web test:e2e
```

The Playwright suite starts both the API and the web app, then verifies:

- the first article is selected by default
- selecting another article updates the URL with `articleId`
- refreshing preserves the same selected article
- a stale `articleId` renders the unavailable state while the list stays visible

## Shared UI Boundary

Reusable shadcn/Tailwind primitives live in `packages/ui`. App-specific reader data loading and composition stay in `apps/web`.
