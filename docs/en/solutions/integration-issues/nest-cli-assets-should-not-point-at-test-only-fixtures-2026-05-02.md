---
title: Nest CLI assets should not point at test-only fixtures
date: 2026-05-02
category: integration-issues
module: apps/api build
problem_type: integration
component: nest_cli_assets
severity: low
applies_when:
  - reviewing `apps/api/nest-cli.json`
  - fixture files live under `src/**/fixtures` only for Jest specs
  - Nest build assets are configured for a path that no longer exists
tags:
  [apps-api, nest-cli, build-assets, fixtures, test-only, integration-review]
---

# Nest CLI assets should not point at test-only fixtures

## Context

`apps/api/nest-cli.json` had an `assets` entry for `articles/fixtures/**/*`,
but the real fixtures now live at `src/article-content/fixtures/` and are
only consumed from `article-content-extraction.service.spec.ts` via
`readFileSync(__dirname, "fixtures", ...)`.

That means the asset rule was stale in two ways:

1. It pointed at an old path that no longer matched the repo layout.
2. It tried to treat spec-only HTML samples as build assets, even though the
   runtime code never reads them.

## Review note

**Remove the asset block instead of keeping a dead path.**

- Jest specs read fixture files directly from source.
- `nest build` output is not part of the spec execution path.
- Keeping the stale asset rule adds false confidence that build packaging is
  doing something useful here.

## Why This Matters

Test-only fixtures should stay test-local unless runtime code or packaging
really needs them. If a build config references them, the config should be
kept in sync with the actual fixture location or removed entirely.

In this repo, the safer choice was removal: the fixtures are source-only test
inputs, not deployable assets.
