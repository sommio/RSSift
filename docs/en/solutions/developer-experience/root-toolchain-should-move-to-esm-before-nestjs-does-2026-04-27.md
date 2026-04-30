---
title: Root monorepo toolchain should move to ESM before NestJS does
date: 2026-04-27
category: developer-experience
module: monorepo root toolchain
problem_type: developer_experience
component: development_workflow
severity: low
applies_when:
  - reviewing root-level tooling in this Turborepo monorepo
  - changing `turbo.json`, root `package.json`, or repo automation scripts
  - deciding when to migrate shared tooling config to ESM
  - considering an `apps/api` NestJS module-format migration in the same change
  - NestJS v12 has not been released yet, or the repo is still waiting on the
    upstream ESM path
tags:
  [
    turborepo,
    monorepo,
    esm,
    nestjs,
    toolchain,
    root-config,
    developer-experience,
  ]
---

# Root monorepo toolchain should move to ESM before NestJS does

## Context

Root-level tooling and app runtime are not the same migration target.

In this repo, the monorepo root owns the shared build and automation surface:

- `turbo.json`
- root `package.json` scripts
- repo bootstrap / maintenance scripts
- other workspace-wide config that runs outside `apps/api`

That layer should move to ESM first when the change is about toolchain code.

`apps/api` is different. NestJS runtime code depends on framework and loader
compatibility, so it should wait for the upstream NestJS ESM path to be ready.
Use NestJS v12 as the release gate, and track the upstream work such as
`nestjs/nest#16391` before flipping the app itself.

## Guidance

Split the migration into two separate decisions:

1. migrate root toolchain / root automation to ESM
2. migrate NestJS app runtime to ESM only after NestJS v12 is available

Do not bundle those into one "everything moves now" change.

If the root tooling can already run on ESM, do that first. Keep the app-side
NestJS format unchanged until the framework release and upstream support are in
place.

## Why This Matters

The blast radius is different.

Root toolchain ESM mostly affects repo maintenance and task orchestration.
NestJS ESM affects application startup, module resolution, and framework
compatibility. Mixing them makes review harder and increases the chance that a
tooling migration gets blocked by a framework migration that is not ready yet.

Sequencing them keeps the repo moving without turning one compatibility gap into
two.

## When to Apply

- when reviewing root config or workspace scripts
- when deciding the order of ESM migration work
- when `turbo.json` or repo automation is being modernized
- when someone wants to migrate `apps/api` before the upstream NestJS ESM path
  is ready
- when a review needs a clear split between toolchain migration and app runtime
  migration

## Related

- `turbo.json`
- root `package.json`
- `apps/api`
- `docs/zh-Hans/solutions/developer-experience/root-toolchain-should-move-to-esm-before-nestjs-does-2026-04-27.md`
- `https://github.com/nestjs/nest/pull/16391`
