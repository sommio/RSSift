# Contributing

## Scope

This repository is a Turborepo monorepo containing:

- `apps/api`: NestJS API, handling feed ingestion, Prisma persistence, and summary generation
- `apps/web`: Next.js web reader
- `packages/*`: Shared UI components and shared configuration packages

Application code lives in `apps/`, while shared code and configuration live in `packages/`.

## Requirements

- Node.js `24.14.1` or later
- pnpm `10.33.0` or later
- Local PostgreSQL 18 for development and tests

Expected local database connections:

- `postgresql://rssift:rssift@127.0.0.1:5432/rssift`
- `postgresql://rssift:rssift@127.0.0.1:5432/rssift_test` for local e2e and test runs

## First-Time Setup

```bash
git clone https://github.com/sommio/RSSift
cd RSSift
pnpm install
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
cp apps/api/feeds.opml.example apps/api/feeds.opml
pnpm --filter api db:deploy
```

If you want seed data, run:

```bash
pnpm --filter api db:seed
```

## Local Development

Run the entire workspace:

```bash
pnpm dev
```

Or run apps separately:

```bash
pnpm --filter api dev
pnpm --filter web dev
```

Default local URLs:

- API: `http://127.0.0.1:3000`
- Web: `http://127.0.0.1:3001`

If the database schema is behind migrations, apply them before starting dev servers:

```bash
pnpm --filter api db:deploy
```

## Quality Gates

Local Git hooks are installed automatically by `pnpm install` through Husky:

- `pre-commit`: `pnpm lint:staged`
- `pre-push`: `pnpm typecheck`

Common verification commands:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

## Package Commands

API / Prisma commands:

```bash
pnpm --filter api db:generate
pnpm --filter api db:migrate
pnpm --filter api db:deploy
pnpm --filter api db:reset
pnpm --filter api db:seed
pnpm --filter api db:studio
```

## AI Workflow

We adopt Every's Compound Engineering workflow, implemented as proactively-callable skills. The default path for day-to-day work is:

`ce:brainstorm -> ce:plan -> ce:work -> ce:review -> ce:compound`

If the problem is still fuzzy, start with `ce:ideate` to clarify direction.

In practical terms:

- When requirements are unclear, use `ce:brainstorm` to explore
- Once direction is clear, use `ce:plan` to break down work before writing code
- During implementation, use `ce:work` against the plan rather than a vague prompt
- After implementation, use `ce:review` to check for bugs, regressions, architecture issues, and missing tests
- When something valuable is learned, use `ce:compound` to capture it back into the repo for future reference

These skills can be invoked proactively. They do not need to wait for the user to name them first.

Reference material:

- Plugin: [EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin)
- Article: [Compound Engineering: How Every Codes With Agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)

## Documentation Policy

All durable documentation must be maintained in synchronized Chinese and English versions:

- English docs: `docs/en/`
- Simplified Chinese docs: `docs/zh-Hans/`

Update both language versions in the same change.
