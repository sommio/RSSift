---
title: Keep PR quality CI trust-aware, no-op-safe, and bootstrap-stable in a monorepo
date: 2026-04-12
last_updated: 2026-04-13
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
  - GitHub-hosted Node runtime upgrades can invalidate workflow assumptions
  - maintainers need to verify remote cache hits separately from cache warm-up
tags:
  [
    github-actions,
    pr-quality,
    monorepo,
    turbo,
    remote-cache,
    trusted-base,
    node-24,
    action-runtime,
  ]
---

# Keep PR quality CI trust-aware, no-op-safe, and bootstrap-stable in a monorepo

## Context

We rolled out a PR-only GitHub Actions quality workflow for this Turborepo monorepo and needed it to satisfy three constraints at the same time:

- branch protection must always receive stable required checks
- the workflow must stay conservative when trust, scope, or package boundaries are unclear
- GitHub-hosted runtime upgrades must not silently invalidate scripts, action versions, or cache assumptions

The documented stabilization in these handoffs centered on `.github/workflows/pr-quality.yml`, `apps/api/package.json`, and `.prettierignore`, with the existing helper-script design in `.github/scripts/` and the maintainer guidance in `README.md` / `README.zh-Hans.md` providing the surrounding workflow context.

The important learning is not one isolated code fix. It is the workflow shape that stayed usable after real smoke-run failures and follow-up verification:

- classify scope from trusted base logic before running PR-branch commands
- make docs-only pull requests explicit no-op successes instead of skipped checks
- keep deletion-aware scope classification and conservative fallbacks
- allow remote cache only for trusted same-repo pull requests
- audit every JavaScript-based action when GitHub raises its Node runtime baseline
- verify remote cache in two stages: warm-up first, then explicit cache hits on the next identical rerun
- separate public-repo visibility from same-repo PR secret exposure in security reasoning

## Guidance

For this repo, the stable pattern is:

1. Keep orchestration in GitHub Actions YAML, but move branchy scope and command logic into tiny tested helper scripts.
2. Evaluate scope and command planning from trusted base code before checking out the candidate PR branch.
3. Make docs-only pull requests finish with explicit successful jobs so required checks do not stay pending.
4. Use affected mode only when the change is limited to app-local surfaces; fall back to full-repo gates for shared packages, root config, workflows, or any ambiguous case.
5. Gate Turbo remote cache to trusted same-repository pull requests that actually have both `TURBO_TOKEN` and `TURBO_TEAM`.
6. Treat `.prettierignore` and package-level test scripts as workflow inputs. If they drift from repo ownership boundaries or runner runtime behavior, CI results become noisy or misleading.
7. When GitHub surfaces a Node runtime warning from one JavaScript-based action, audit every JavaScript-based action in the workflow rather than stopping after the first upgrade.
8. Prove remote cache in two passes: one rerun may only warm the cache, while the next rerun with identical inputs must show explicit `cache hit` log lines before you call the optimization verified.
9. Keep non-blocking local-only warnings, such as the Jest `--localstorage-file` teardown warning, isolated from the main CI-health narrative unless they start failing the gate.

The trust boundary belongs in the workflow, not in reviewer memory. The workflow checks out the base SHA into `.trusted-base` and runs the policy helpers from there before any PR-branch checkout:

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

The workflow also has to stay aligned with the current GitHub-hosted Node runtime. In this rollout, that meant removing a now-invalid Node option from API test scripts and upgrading JavaScript-based actions away from Node 20-era runtimes:

```json
{
  "scripts": {
    "test": "jest --runInBand",
    "test:e2e": "jest --config ./e2e/jest-e2e.json --runInBand"
  }
}
```

```yaml
- uses: pnpm/action-setup@v5
- uses: actions/github-script@v8
```

Remote cache verification needs stricter evidence than a single green rerun. In this repo, run `24308312552` completed green overall, attempt 2 proved that remote cache was enabled and warming, and attempt 3 was the first run that showed real cache hits and replayed logs across `static`, `test`, and `e2e`.

## Why This Matters

This pattern prevents a specific class of false confidence.

If docs-only PRs are skipped at the workflow edge, required checks can stay pending forever. If trust-sensitive policy runs from the PR branch, the PR is partially allowed to decide how it should be judged. If deletion-aware scope detection is missing, a delete-plus-docs change can collapse into a fake docs-only success. If action versions lag behind GitHub's Node baseline, CI can look healthy until the next runtime deprecation turns into breakage. If remote cache is only warmed but never read back, maintainers can overestimate the performance benefit. And if security reasoning conflates public visibility with execution-context trust, the real residual risk remains hidden.

By making these constraints executable, the workflow becomes auditable and predictable:

- branch protection sees stable job names such as `pr-quality / format`, `pr-quality / static`, `pr-quality / test`, and `pr-quality / e2e`
- remote cache stays a performance optimization instead of a correctness dependency
- action runtime upgrades become part of workflow maintenance instead of emergency cleanup
- shared package boundaries behave consistently in CI and on clean local checkouts
- same-repo PR secret exposure stays visible as the remaining trust decision, while fork PRs remain intentionally uncached

A public repository does not automatically leak Turbo secrets. The more precise statement is: under the current `pull_request` design, forks remain gated away from cache secrets, but same-repository PR execution still deserves trust because those jobs can receive `TURBO_TOKEN` and `TURBO_TEAM`.

## When to Apply

- When a monorepo needs PR-only CI with stable required checks
- When workflow policy depends on change classification such as docs-only, app-local, or shared/root
- When a workflow should use `--affected` selectively instead of everywhere
- When secrets such as Turbo remote cache tokens must not be exposed to untrusted pull requests
- When GitHub-hosted Node runtime changes can invalidate package scripts or JavaScript-based action versions
- When maintainers need to verify that remote cache is actually serving hits, not just warming
- When a local warning is noisy but non-blocking and should be tracked separately from CI gate health

If the repository has no branch protection, no helper-script policy, and no built shared-package boundary, this full pattern may be unnecessary. Once those constraints exist, encoding them directly in the workflow becomes worth the extra structure.

## Examples

The resulting rollout in this repo uses these concrete pieces together:

- `.github/workflows/pr-quality.yml` is the main rollout surface: it keeps the stable jobs, upgrades `pnpm/action-setup` to `v5`, upgrades `actions/github-script` to `v8`, and preserves same-repo-only cache env wiring.
- `.prettierignore` excludes tool-managed directories so the format gate stays aligned with repo-owned surfaces.
- `apps/api/package.json` removes the invalid `NODE_OPTIONS=--no-webstorage` usage so API tests remain compatible with GitHub Actions Node `24.14.1`.
- `apps/api/e2e` keeps the app-level API suite explicit, while `apps/api/test-support` holds helpers shared by colocated specs and e2e.
- `.github/scripts/eslint-guardrails.test.mjs` gives the existing lint gate a repo-owned regression harness without inventing a second enforcement path.
- The existing helper scripts in `.github/scripts/pr-quality-scope.mjs`, `.github/scripts/pr-quality-scope.test.mjs`, and `.github/scripts/pr-quality-command-plan.mjs` remain the trust and planning context that makes the workflow behavior auditable.
- `README.md` and `README.zh-Hans.md` remain the maintainer-facing explanation of trusted same-repo cache behavior.

Good verification for this pattern should include:

- helper-script tests for scope and command planning
- workflow syntax validation
- docs-only, app-local, and shared/root classification checks
- local `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and package-specific test runs
- remote evidence that distinguishes cache enablement from cache hits, such as run `24308312552` attempt 2 vs attempt 3

## Related

- `docs/en/brainstorms/2026-04-12-github-pr-quality-ci-requirements.md`
- `docs/zh-Hans/brainstorms/2026-04-12-github-pr-quality-ci-requirements.md`
- `docs/en/plans/2026-04-12-001-feat-github-pr-quality-ci-plan.md`
- `docs/zh-Hans/plans/2026-04-12-001-feat-github-pr-quality-ci-plan.md`
- `docs/en/plans/2026-04-12-002-fix-pr-quality-ci-stabilization-plan.md`
- `docs/zh-Hans/plans/2026-04-12-002-fix-pr-quality-ci-stabilization-plan.md`
- `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`
- `docs/zh-Hans/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`
- `.github/workflows/pr-quality.yml`
- `.github/scripts/pr-quality-scope.mjs`
- `.github/scripts/pr-quality-scope.test.mjs`
- `.github/scripts/pr-quality-command-plan.mjs`
