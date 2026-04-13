---
title: Root pnpm typecheck relies on Turbo workspace task coverage, not root tsc coverage
date: 2026-04-13
category: developer-experience
module: monorepo tooling
problem_type: developer_experience
component: development_workflow
severity: medium
applies_when:
  - maintaining root typecheck commands in a Turborepo workspace
  - adding a new workspace or package with TypeScript code
  - deciding whether root-level type checking covers all packages
  - reshaping the root tsconfig into a solution-style editor entrypoint
tags: [pnpm, turbo, turborepo, typecheck, typescript, monorepo, workspace]
---

# Root pnpm typecheck relies on Turbo workspace task coverage, not root tsc coverage

## Context

In this Turborepo monorepo, the root `pnpm typecheck` is intentionally wired to `turbo run typecheck`. The root command is therefore a workspace-wide aggregation entrypoint, not a direct substitute for compiling only the root `tsconfig.json`.

That distinction matters more after the root `tsconfig.json` was intentionally reshaped into a solution-style editor entrypoint. It is useful for editor navigation and project references, but it is not the authoritative source of truth for workspace-wide type safety.

## Guidance

Treat root `pnpm typecheck` as the canonical workspace-wide typecheck command for this repository, because it runs the Turbo task graph and picks up each workspace/package `typecheck` task that has been explicitly wired.

Do not rely on `pnpm exec tsc --noEmit -p tsconfig.json` as the mental model for whole-repo coverage. That command can succeed while checking only the solution-style root config surface, which is not the same thing as verifying every TypeScript workspace.

When adding a new workspace, make sure it explicitly participates in the Turbo `typecheck` graph. In practice, that means the new app or package needs a real `typecheck` script that Turbo can invoke, and maintainers need to keep the root workflow pointed at the aggregated task rather than backsliding to root-only `tsc` assumptions.

## Why This Matters

The risky failure mode here is silent under-coverage. A root `tsconfig.json` can look authoritative even when it mainly exists for editor ergonomics and project references. If maintainers treat it as the workspace-wide typecheck gate, a new package can be added without ever being checked in CI or local verification.

The current design avoids that trap: `pnpm typecheck` delegates to `turbo run typecheck`, so coverage is defined by the workspace task graph instead of by implicit root-config behavior. That is explicit and correct today. The future risk is operational drift: if a new workspace is added without its own `typecheck` task wiring, root `pnpm typecheck` may still look healthy while silently skipping that workspace.

## When to Apply

- When adding a new app or package to the monorepo
- When wiring or refactoring `typecheck` scripts
- When reviewing what root `pnpm typecheck` actually guarantees
- When deciding whether a TypeScript change is covered by workspace verification
- When changing the root `tsconfig.json` or Turbo task graph behavior

## Examples

Wrong mental model:

```bash
# Treating the root tsconfig as the authoritative workspace-wide check
pnpm exec tsc --noEmit -p tsconfig.json
```

Correct repository-specific model:

```bash
# Workspace-wide verification through Turbo aggregation
pnpm typecheck
# current root script: turbo run typecheck
```

A new workspace must be visible to the Turbo task graph:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

If that script is missing, root `pnpm typecheck` can remain green while silently skipping the new workspace.

## Related

- `package.json`
- `turbo.json`
- `tsconfig.json`
- `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`
- `docs/en/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`
