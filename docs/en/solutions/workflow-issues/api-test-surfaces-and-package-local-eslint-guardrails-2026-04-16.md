---
title: Keep API test surfaces explicit and maintainability guardrails package-local
date: 2026-04-16
category: workflow-issues
module: api test surfaces and lint guardrails
problem_type: workflow_issue
component: tooling
severity: medium
applies_when:
  - a package mixes colocated specs with app-level e2e suites
  - shared test helpers are reused outside the e2e tree
  - a monorepo already has package-local eslint entrypoints
  - maintainability budgets need regression coverage without adding a second lint path
symptoms:
  - a directory named like e2e also contains helpers imported by colocated specs
  - package-local eslint exists but large-file or large-function budgets are not enforced
  - root lint can accidentally parse synthetic fixtures that only make sense in package context
root_cause: missing_workflow_step
resolution_type: workflow_improvement
tags:
  [
    api-e2e,
    test-support,
    package-local-eslint,
    eslint-guardrails,
    monorepo,
    turborepo,
    testing-boundaries,
    repo-tooling,
  ]
---

# Keep API test surfaces explicit and maintainability guardrails package-local

## Context

This repo had two healthy API test layers, but one misleading boundary. Feature-local specs already lived under `apps/api/src/**/*.spec.ts`, while app-level HTTP and database suites lived under `apps/api/test`. The naming problem was that `apps/api/test` was not actually e2e-only: `apps/api/src/articles/article.repository.spec.ts` imported the shared database helper from that tree.

At the same time, the monorepo already had package-local ESLint entrypoints in `apps/api/eslint.config.mjs` and `apps/web/eslint.config.mjs`, but it had no maintainability budgets for large files, large functions, or high-complexity control flow. The repo needed a small first layer of guardrails without inventing a second lint enforcement path.

## Guidance

Use three explicit test surfaces inside `apps/api`, and keep repo-specific ESLint budgets inside the owning app configs.

1. Keep feature-local specs colocated in `apps/api/src/**/*.spec.ts`.
2. Put app-level suites and their Jest config under `apps/api/e2e/**`.
3. Move helpers reused by both colocated specs and e2e into `apps/api/test-support/**` instead of leaving them under an e2e-only namespace.
4. Keep numeric `max-lines`, `max-lines-per-function`, and `complexity` thresholds in each app's `eslint.config.mjs`, not in `packages/eslint-config`.
5. Validate those thresholds with a repo-owned regression harness under `.github/scripts/`, but keep the actual enforcement path as the existing `pnpm lint` -> `turbo run lint` flow.
6. Ignore raw fixture templates from the root ESLint config if those fixtures are only valid after being materialized inside an app-relative path by the harness.

The API boundary split is the key structural change:

```text
apps/api/src/**/*.spec.ts      # colocated unit / narrow integration specs
apps/api/e2e/**                # app-level HTTP and database suites
apps/api/test-support/**       # helpers shared by spec and e2e surfaces
```

The concrete boundary repair is visible in the moved import:

```ts
import {
  createTestPrismaClient,
  prepareTestDatabase,
} from "../../test-support/database";
```

The maintainability policy then stays package-local. In `apps/api/eslint.config.mjs`, production code and test code get different budgets:

```js
{
  files: ["src/**/*.ts"],
  ignores: ["src/**/*.spec.ts", "src/generated/**"],
  rules: productionRules,
},
{
  files: ["src/**/*.spec.ts", "test-support/**/*.ts", "e2e/**/*.ts"],
  rules: testRules,
},
```

The repo-owned harness checks that those file-role globs continue to behave as intended:

```js
test("API e2e fixtures share the relaxed test budget", (t) => {
  const result = withFixture(
    t,
    apiDir,
    "api/e2e-pass.e2e-spec.ts",
    `e2e/__guardrails__/${id}/e2e-pass.e2e-spec.ts`,
  );

  assert.equal(result.errorCount, 0);
});
```

## Why This Matters

This pattern fixes two kinds of drift at once.

First, filesystem semantics stop lying. If a colocated spec imports a helper from a directory named like e2e, future contributors will infer the wrong ownership model and keep expanding the confusion. `apps/api/e2e` should only mean app-level suites; `apps/api/test-support` should mean shared test-only infrastructure.

Second, maintainability policy stays where ownership already lives. This monorepo already routes lint through package-local entrypoints. If repo-specific numeric thresholds were moved into `packages/eslint-config` or a new root wrapper, the policy would become harder to calibrate, harder to test against local inventories, and easier to misapply across unrelated packages.

The regression harness matters because flat-config `files` globs are easy to weaken accidentally during future refactors. A repo-owned test can prove that source, spec, e2e, test-support, component, and App Router entry surfaces still receive the intended budgets, while CI continues to enforce only one lint path.

One caveat from the final review: the current web guardrail coverage intentionally does not cover every ordinary `apps/web/app/**` production file. Named App Router special files are covered, but broader `app/**` surfaces would need separate follow-up if the repo later wants stricter coverage there.

## When to Apply

- When one package has both colocated specs and app-level e2e suites
- When a helper currently living under an e2e tree is reused by non-e2e tests
- When package-local ESLint entrypoints already exist and you want to add maintainability budgets without inventing a parallel gate
- When you need regression coverage for ESLint override globs but want CI enforcement to remain on the normal lint pipeline

## Examples

Before:

```text
apps/api/test/articles.e2e-spec.ts
apps/api/test/jest-e2e.json
apps/api/test/test-db.ts
apps/api/src/articles/article.repository.spec.ts -> ../../test/test-db
```

After:

```text
apps/api/e2e/articles.e2e-spec.ts
apps/api/e2e/jest-e2e.json
apps/api/test-support/database.ts
apps/api/src/articles/article.repository.spec.ts -> ../../test-support/database
```

Root lint also needs to stay aware of the harness boundary:

```js
export default [
  ...baseConfig,
  {
    ignores: [".github/scripts/fixtures/**"],
  },
];
```

Without that ignore, root lint would try to parse synthetic fixture files outside the app-relative context that the guardrail harness deliberately creates.

## Related

- `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`
- `docs/en/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`
- `docs/en/solutions/integration-issues/ci-e2e-runtime-inputs-must-match-seeded-targets-2026-04-16.md`
- `.claude/handoffs/2026-04-16-204405-refactor-test-boundaries-eslint-guardrails.md`
- `.claude/handoffs/2026-04-16-205910-post-review-no-action.md`
