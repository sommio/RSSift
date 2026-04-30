---
title: Turbo task config should stay human-readable and flat when intent is simple
date: 2026-04-26
category: developer-experience
module: turbo task config
problem_type: developer_experience
component: development_workflow
severity: low
applies_when:
  - reviewing `turbo.json` task wiring in a monorepo
  - a task only needs the current package's `build` to finish first
  - `dependsOn` chains become harder to read than the intent they express
  - the same dependency edge is written twice through nested task indirection
tags:
  [turbo, turborepo, turbo.json, dependsOn, build, readability, developer-experience]
---

# Turbo task config should stay human-readable and flat when intent is simple

## Context

When a Turbo task only needs the current package's `build` task to complete
before it runs, the simplest readable form is usually the best form.

In this repo, a compact task block like this is easier to scan during review:

```json
{
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "lint": {
      "dependsOn": ["build", "^lint"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["build", "^typecheck"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "test:e2e": {
      "dependsOn": ["build"],
      "outputs": []
    }
  }
}
```

That shape reads like intent, not machinery:

- `build` handles dependency-package builds
- leaf tasks depend on the package's own `build`
- the graph stays short enough to reason about during review

## Guidance

Prefer the shortest `dependsOn` expression that matches the real intent.

If `build` already carries the dependency-package edge, repeating `^build` on
every leaf task usually adds visual noise without making the contract clearer.

Do not spread the same dependency rule across multiple layers unless the extra
indirection expresses a different guarantee.

## Why This Matters

Reviewers read config to understand behavior fast.

When a `turbo.json` file makes people mentally expand `test -> build -> ^build`
just to recover the real rule, the config is doing more work than it should.
That does not make the repo broken, but it does make the task graph harder to
inspect under review.

The practical goal is clarity:

- keep `build` responsible for dependency-package build ordering
- keep `test`, `lint`, and `typecheck` focused on their own package-level
  prerequisites
- avoid making the same rule look bigger than it is

## When to Apply

- When reviewing `turbo.json` in code review
- When a task chain can be expressed in one obvious hop instead of two
- When duplicated `dependsOn` edges make the file harder to scan
- When the config is correct but unnecessarily intimidating

## Related

- `turbo.json`
- `https://turborepo.dev/docs/reference/configuration`
- `https://turborepo.dev/docs/core-concepts/package-and-task-graph`
