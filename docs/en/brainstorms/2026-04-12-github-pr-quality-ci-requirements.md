---
date: 2026-04-12
topic: github-pr-quality-ci
---

# GitHub PR Quality CI

## Problem Frame

This repository already has local quality gates through Husky, staged-file linting, and workspace scripts, but it still has no checked-in GitHub Actions workflow under `.github/workflows/`. That means pull requests do not yet get an enforced remote quality gate before merge, even though the repo already exposes the relevant commands for formatting, linting, unit/integration tests, and end-to-end tests.

The user goal is not a broad CI/CD program. The goal is a PR-only quality gate that is strict enough to block bad changes, reuses the existing Turborepo task graph, takes advantage of Vercel Remote Cache, and stays conscious of a limited monthly GitHub Actions budget.

## Requirements

**Trigger and scope**

- R1. The quality workflow must run for pull requests only. It must not introduce commit-time or generic `push`-time cloud CI for this scope.
- R2. The workflow must cover code quality only. It must exclude deployment, Docker image building, release automation, and unrelated delivery concerns.
- R3. The workflow must reuse existing repo-level and package-level quality entry points rather than inventing a parallel task model.

**Required quality gates**

- R4. Every code-affecting PR in scope must be checked for formatting, linting, tests, and end-to-end tests before merge.
- R5. Because this repo already exposes a workspace `typecheck` gate, PR quality CI should include typechecking as an additional required signal rather than leaving it only to local hooks.
- R6. The PR UI should make it obvious which gate failed. Format, lint/typecheck, test, and e2e outcomes must be legible enough to use as branch-protection checks.
- R7. The CI design must preserve the current upstream `build` prerequisites for tasks such as `lint` and `typecheck` where those builds are needed to emit `d.ts` artifacts and validate package type boundaries. Cost optimizations must not weaken that boundary check.

**Cost and runtime efficiency**

- R8. The workflow must minimize wasted minutes by cancelling superseded runs for the same PR and by avoiding unnecessary duplication across jobs or workflows.
- R9. The workflow should prefer Turborepo-native incremental execution for turbo-managed tasks when that preserves correctness, especially for PR diffs that affect only part of the monorepo.
- R10. The workflow must use Vercel Remote Cache in GitHub Actions for cache-eligible runs where credentials are available.
- R11. Required checks must not rely on top-level workflow path filters that could leave required checks in a permanently pending state; any cost-saving skip logic must still resolve the PR checks clearly.
- R12. If the workflow uses `no-op success` to save minutes, the initial rollout should keep that logic coarse, conservative, and easy to audit, starting with obvious cases such as documentation-only or non-code PRs rather than fine-grained dependency inference.

**Safety and trust boundaries**

- R13. The workflow must remain safe for untrusted PR execution. It should not require a design that exposes cache credentials to forked PR code just to make the cache work.
- R14. When cache credentials are unavailable, the workflow should degrade gracefully by still running the checks without remote cache rather than silently weakening the quality gate.

## Success Criteria

- A pull request that changes code cannot merge until formatting, linting, typechecking, tests, and e2e checks pass.
- The repository gains a checked-in GitHub Actions quality workflow under `.github/workflows/` that is clearly scoped to PR quality gates only.
- Same-repository or trusted PRs benefit from Vercel Remote Cache, and reruns become noticeably cheaper than uncached first runs.
- Superseded PR runs are cancelled automatically instead of consuming minutes until completion.
- If no-op optimization is enabled, obvious non-code PRs can short-circuit expensive work without leaving branch-protection checks stuck in a pending state.
- Skip behavior stays simple enough that reviewers can understand why a job ran or did not run.

## Scope Boundaries

- This decision covers GitHub Actions quality checks for pull requests only.
- This decision does not change local Git hooks in `.husky/`.
- This decision does not redesign the monorepo layout, package boundaries, or release flow.
- This decision does not require a full-repository build job unless a later plan proves that one specific quality gate cannot run correctly without it.
- This decision does not adopt `pull_request_target` as the default execution model for running untrusted PR code.

## Key Decisions

- Use a PR-only GitHub Actions workflow on `pull_request` as the default event surface. This matches the stated budget constraint and avoids paying for separate push workflows.
- Treat the work as a cost-aware quality gate, not as a generic CI expansion. The right question is how to make required PR checks strict and cheap, not how to mirror every local command blindly.
- Prefer one workflow with a lightweight setup/change-detection stage and multiple named quality jobs over many unrelated workflows. This keeps branch protection readable while avoiding repeated orchestration overhead.
- Preserve the current `build` prerequisites behind `lint` and `typecheck` where they are required to emit `d.ts` files and verify inter-package type boundaries. That cost is intentional, not accidental.
- Keep `format`, `lint`, `typecheck`, `test`, and `test:e2e` all in scope. `No-op success` is an optional second-step optimization, not a mandatory starting point.
- If `no-op success` is introduced, start with coarse, low-risk rules such as documentation-only or clearly non-code PRs. Do not begin with fine-grained dependency inference across the monorepo.
- Use Vercel Remote Cache where GitHub Actions can safely provide `TURBO_TOKEN` and `TURBO_TEAM`, but do not redesign the workflow around secrets exposure for forks. Forked PRs may run uncached if necessary.
- Prefer internal change detection over top-level `paths` or `paths-ignore` workflow filters for required checks. The cost-saving logic should happen inside the workflow so required checks still resolve deterministically.

## Dependencies / Assumptions

- `package.json` already exposes `format:check`, `lint`, `typecheck`, `test`, and `test:e2e` entry points that can act as CI-facing quality gates.
- `turbo.json` already defines turbo-managed tasks for `lint`, `typecheck`, `test`, and `test:e2e`, which makes `--affected` a plausible optimization path during planning.
- `apps/web/playwright.config.ts` already starts the API and web servers for Playwright-based e2e coverage, so browser e2e is a real existing gate rather than a future placeholder.
- `apps/api/test/jest-e2e.json` confirms that API e2e coverage already exists separately from the browser suite.
- The current `turbo.json` task graph makes `lint` and `typecheck` depend on upstream `build` tasks, and that behavior is intentional because upstream builds emit `d.ts` artifacts used to validate package type boundaries.
- GitHub Actions secrets are not available to forked pull requests by default, so remote caching must be treated as conditional rather than guaranteed for every PR.

## Alternatives Considered

- **Single monolithic job:** simplest YAML and lowest orchestration complexity, but weakest failure isolation and more rerun waste when only one stage flakes or fails.
- **Many independent workflows:** very clear ownership per check, but duplicates setup/install overhead and tends to spend more minutes overall.
- **Recommended direction — one PR workflow with staged jobs and internal change detection:** preserves clear required checks while giving the planner room to cut waste with concurrency, caching, and affected-only execution.

## Outstanding Questions

### Deferred to Planning

- [Affects R9][Technical] Which jobs should use full-repo execution versus `turbo run ... --affected` without creating false negatives while preserving the intentional upstream `build` prerequisites for type-boundary validation.
- [Affects R10][Needs research] What is the cleanest secret-handling shape for Vercel Remote Cache so same-repo PRs use it and fork PRs degrade safely.
- [Affects R12][Technical] Whether the first rollout should omit `no-op success` entirely or enable it only for documentation-only and clearly non-code PRs.
- [Affects R12][Technical] If coarse no-op optimization is enabled, which file groups count as globally risky and should force normal execution instead of being skipped.
- [Affects R6][Technical] Whether branch protection should require one umbrella workflow result, individual job names, or both.
- [Affects R14][Technical] Whether e2e should always run as a separate terminal job or be split further by app surface during implementation.

## Next Steps

-> /ce:plan for structured implementation planning
