---
title: Keep PR quality CI trust-aware, no-op-safe, and bootstrap-stable in a monorepo
date: 2026-04-12
category: workflow-issues
module: pr quality ci
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - building a pull-request-only quality workflow in a monorepo
  - branch protection depends on stable required job names
  - the workflow must distinguish docs-only, app-local, and shared changes
  - turbo remote cache should only run in trusted same-repo contexts
  - apps depend on shared packages that now export built artifacts
tags:
  [
    github-actions,
    pr-quality,
    monorepo,
    turbo,
    remote-cache,
    package-boundary,
    clean-checkout,
    docs-only,
  ]
---

# Keep PR quality CI trust-aware, no-op-safe, and bootstrap-stable in a monorepo

## Context

We rolled out a PR-only GitHub Actions quality workflow for this Turborepo monorepo and needed it to satisfy two constraints at the same time:

- branch protection must always receive stable required checks
- the workflow must stay conservative when trust, scope, or package boundaries are unclear

The resulting implementation spans `.github/workflows/pr-quality.yml`, helper scripts in `.github/scripts/`, root task wiring in `package.json`, and the shared UI boundary in `packages/ui`.

The important learning is not one isolated code fix. It is the workflow shape that kept the rollout usable after verification:

- classify scope from trusted base logic before running PR-branch commands
- make docs-only pull requests explicit no-op successes instead of skipped checks
- keep deletion-aware scope classification and conservative fallbacks
- allow remote cache only for trusted same-repo pull requests
- treat shared packages as real boundaries and bootstrap them explicitly for local app flows

## Guidance

For this repo, the stable pattern is:

1. Keep orchestration in GitHub Actions YAML, but move branchy scope and command logic into tiny tested helper scripts.
2. Evaluate scope and command planning from trusted base code before checking out the candidate PR branch.
3. Make docs-only pull requests finish with explicit successful jobs so required checks do not stay pending.
4. Use affected mode only when the change is limited to app-local surfaces; fall back to full-repo gates for shared packages, root config, or any ambiguous case.
5. Gate Turbo remote cache to trusted same-repository pull requests that actually have both `TURBO_TOKEN` and `TURBO_TEAM`.
6. If a shared package becomes a built boundary, downstream apps must bootstrap it explicitly for local `dev`, `build`, `typecheck`, and `test` flows.
7. Keep direct Jest resolution pointed at a resolvable source surface when generated artifacts may not exist yet on a clean checkout.

The trust boundary belongs in the workflow, not in reviewer memory. The workflow now checks out the base SHA into `.trusted-base` and runs the policy helpers from there before any PR-branch checkout:

```yaml
- name: Check out trusted base for scope evaluation
  uses: actions/checkout@v5
  with:
    ref: ${{ github.event.pull_request.base.sha }}
    path: .trusted-base

- name: Classify PR scope from trusted base logic
  run: |
    node .trusted-base/.github/scripts/pr-quality-scope.mjs \
      --changed-files-json "$CHANGED_FILES_JSON" \
      --github-output "$GITHUB_OUTPUT"
```

The scope helper stays conservative. It treats docs-only PRs as `noop`, app-local-only changes as `affected`, and everything else as `full`. When it falls back to git diff, it keeps deleted files in the classification:

```js
const stdout = execFileSync(
  "git",
  ["diff", "--name-only", "--diff-filter=ACMRD", `${base}...${head}`],
  { encoding: "utf8" },
);
```

The command planner makes docs-only behavior explicit instead of relying on skipped jobs:

```js
if (docsOnly || runMode === "noop") {
  return {
    should_run: false,
    reason: "docs-only-noop",
  };
}
```

The local web app flow also needs an explicit bootstrap once `@repo/ui` starts exporting built artifacts:

```json
{
  "scripts": {
    "predev": "pnpm --filter @repo/ui build",
    "prebuild": "pnpm --filter @repo/ui build",
    "pretypecheck": "pnpm --filter @repo/ui build",
    "pretest": "pnpm --filter @repo/ui build"
  }
}
```

And direct Jest runs should not depend on pre-existing `packages/ui/dist` output:

```ts
moduleNameMapper: {
  '^@repo/ui$': '<rootDir>/../../packages/ui/src/index.ts',
  '^@repo/ui/(.*)$': '<rootDir>/../../packages/ui/src/$1',
}
```

## Why This Matters

This pattern prevents a specific class of false confidence.

If docs-only PRs are skipped at the workflow edge, required checks can stay pending forever. If trust-sensitive policy runs from the PR branch, the PR is partially allowed to decide how it should be judged. If deletion-aware scope detection is missing, a delete-plus-docs change can collapse into a fake docs-only success. If local app flows rely on leftover `dist` artifacts, the shared package boundary is only accidentally working.

By making these constraints executable, the workflow becomes auditable and predictable:

- branch protection sees stable job names such as `pr-quality / format`, `pr-quality / static`, `pr-quality / test`, and `pr-quality / e2e`
- remote cache stays a performance optimization instead of a correctness dependency
- shared package boundaries behave consistently in CI and on clean local checkouts
- app-local changes can stay faster without widening that optimization to shared or root-owned changes

## When to Apply

- When a monorepo needs PR-only CI with stable required checks
- When workflow policy depends on change classification such as docs-only, app-local, or shared/root
- When a workflow should use `--affected` selectively instead of everywhere
- When secrets such as Turbo remote cache tokens must not be exposed to untrusted pull requests
- When a shared package changes from source-only exports to emitted artifact exports
- When local app commands can bypass the root task graph and therefore need explicit bootstrap behavior

If the repository has no branch protection, no helper-script policy, and no built shared-package boundary, this full pattern may be unnecessary. Once those constraints exist, encoding them directly in the workflow becomes worth the extra structure.

## Examples

The resulting rollout in this repo uses these concrete pieces together:

- `.github/workflows/pr-quality.yml` keeps the stable jobs, explicit docs-only no-op steps, trusted-base scope evaluation, and same-repo-only cache env wiring.
- `.github/scripts/pr-quality-scope.mjs` classifies `noop`, `affected`, and `full`, and preserves deleted files with `--diff-filter=ACMRD`.
- `.github/scripts/pr-quality-command-plan.mjs` keeps job planning auditable and makes docs-only jobs finish successfully without pretending they ran work.
- `package.json` promotes root helper tests into repo validation through `test:root`.
- `packages/ui/package.json` and `packages/ui/tsconfig.build.json` turn `@repo/ui` into a built package boundary with emitted JS and `.d.ts`.
- `apps/web/package.json` and `apps/web/jest.config.ts` keep clean-checkout developer flows working by bootstrapping `@repo/ui` and mapping direct Jest runs to `packages/ui/src`.

Good verification for this pattern should include:

- helper-script tests for scope and command planning
- workflow syntax validation
- docs-only, app-local, and shared/root classification checks
- local app `build`, `typecheck`, and `test` behavior from a clean checkout

## Related

- `docs/en/brainstorms/2026-04-12-github-pr-quality-ci-requirements.md`
- `docs/zh-Hans/brainstorms/2026-04-12-github-pr-quality-ci-requirements.md`
- `docs/en/plans/2026-04-12-001-feat-github-pr-quality-ci-plan.md`
- `docs/zh-Hans/plans/2026-04-12-001-feat-github-pr-quality-ci-plan.md`
- `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`
- `docs/zh-Hans/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`
- `.github/workflows/pr-quality.yml`
- `.github/scripts/pr-quality-scope.mjs`
- `.github/scripts/pr-quality-command-plan.mjs`
