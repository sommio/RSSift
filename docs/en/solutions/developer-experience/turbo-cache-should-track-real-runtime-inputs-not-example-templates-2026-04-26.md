---
title: Turbo cache should track real runtime inputs, not example templates
date: 2026-04-26
category: developer-experience
module: turbo cache inputs
problem_type: developer_experience
component: development_workflow
severity: medium
applies_when:
  - reviewing `turbo.json` cache inputs for env files or local config files
  - a `globalDependencies` entry points at an example template instead of the real runtime file
  - a tracked file does not exist in the repository
  - cache invalidation is expected to reflect runtime behavior, not template churn
  - maintainers want Turbo to remind developers about local setup drift
tags:
  [
    turbo,
    turborepo,
    globaldependencies,
    globalenv,
    env-example,
    cache-hash,
    local-config,
    developer-experience,
  ]
---

# Turbo cache should track real runtime inputs, not example templates

## Context

This repo's `turbo.json` currently lists three example files under
`globalDependencies`:

- `apps/api/.env.example`
- `apps/api/feeds.opml.example`
- `apps/web/.env.example`

The first problem is simple: `apps/web/.env.example` does not exist in the
repository, so Turbo has nothing real to track there.

The other two entries are more subtle. They track example templates, while the
actual runtime inputs are elsewhere:

- `.env` values are already covered by `globalEnv`
- `FEED_OPML_PATH` points at the real `feeds.opml` file, not the example
  template

That means the cache key is being tied to template files that do not directly
drive the runtime behavior.

## Guidance

Use `globalEnv` for real environment variables that affect task hashes.
Use `globalDependencies` for real files that the build or task actually reads.

Do not assume an example file is a useful cache input just because it documents
local setup.

For this repo:

- `apps/web/.env.example` is invalid as a cache input because the file is absent
- `apps/api/.env.example` is mostly redundant because `globalEnv` already tracks
  the actual runtime variables that matter
- `apps/api/feeds.opml.example` is backward-facing because the real runtime file
  is `feeds.opml`, which is local-only and not the same thing as the example
  template

If the intent is to remind developers to update their local files when the
example template changes, Turbo cannot express that contract cleanly. It only
recomputes cache hashes; it does not notify people to copy new variables into
`.env.local` or regenerate a local `feeds.opml`.

## Why This Matters

This is a boundary problem, not just a missing-file problem.

`globalEnv` and `globalDependencies` track different layers:

- `globalEnv` tracks runtime values and changes cache behavior when those values
  change
- `globalDependencies` tracks file content and changes cache behavior when the
  file content changes

An example template usually lives in neither layer of the real runtime contract.
It may be useful documentation, but it is not the same as the file or variable
that actually drives the app.

That creates two risks:

- false confidence that cache invalidation matches runtime behavior
- noisy cache churn when template-only edits do not change the real execution
  inputs

## When to Apply

- When a Turbo cache rule references `.env.example` or another template file
- When a tracked file is only a bootstrap aid and not a real runtime input
- When `globalEnv` already covers the actual variable values
- When the actual input is a local-only file like `feeds.opml`
- When maintainers are deciding whether a cache input is teaching, tracking, or
  both

## Examples

Current pattern:

```json
{
  "globalDependencies": [
    "**/.env.*local",
    "apps/api/.env.example",
    "apps/api/feeds.opml.example",
    "apps/web/.env.example"
  ],
  "globalEnv": ["API_BASE_URL", "DATABASE_URL", "FEED_OPML_PATH"]
}
```

Better mental model:

```text
Track the real env values in globalEnv.
Track the real runtime files in globalDependencies.
Leave example templates to docs and bootstrap guidance.
```

## Related

- `turbo.json`
- `apps/api/.env.example`
- `apps/api/feeds.opml.example`
- `apps/web/.env.example`
- `docs/en/CONTRIBUTING.md`
