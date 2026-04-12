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
- `apps/api` serves fixture-backed article list and detail endpoints.
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

1. Install dependencies:

```bash
pnpm install
```

2. Start the API in one terminal:

```bash
pnpm --filter api dev
```

3. Create `apps/web/.env.local` if it does not exist and set the API base URL:

```bash
API_BASE_URL=http://127.0.0.1:3000
```

4. Start the web app in another terminal:

```bash
pnpm --filter web dev
```

The default local URLs are:

- API: `http://127.0.0.1:3000`
- Web: `http://127.0.0.1:3001`

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
- To enable Turbo remote cache on trusted same-repository pull requests, set
  GitHub Actions secrets `TURBO_TOKEN` and `TURBO_TEAM`. Forks and automated
  pull requests without those secrets intentionally run uncached instead of
  weakening the quality gates.
- No additional operational monitoring required for this workflow rollout
  because it only adds pull request validation and does not change runtime
  production behavior.
