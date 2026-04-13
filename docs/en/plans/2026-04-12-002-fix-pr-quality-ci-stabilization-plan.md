---
title: fix: Stabilize PR quality CI after rollout
type: fix
status: completed
date: 2026-04-12
origin:
  - docs/en/plans/2026-04-12-001-feat-github-pr-quality-ci-plan.md
  - docs/zh-Hans/plans/2026-04-12-001-feat-github-pr-quality-ci-plan.md
---

# fix: Stabilize PR quality CI after rollout

## Overview

This plan stabilizes the newly added PR quality workflow after the first real smoke PR exposed three separate issues: the format gate checks the entire repository instead of the intended repo-owned scope, the API test scripts rely on a Node flag pattern that is rejected in the GitHub Actions Node 24 runtime, and the workflow still emits a future-facing `pnpm/action-setup@v4` Node 20 deprecation warning.

The work stays narrowly focused on making the current PR quality CI pass reliably for legitimate code changes without weakening branch-protection semantics, reducing the trust model, or broadening the scope into a larger CI redesign.

## Problem Frame

The current branch was intentionally used to trigger the newly added PR quality workflow and confirm that a non-docs-only PR can run the remote gate. That smoke run produced actionable failures rather than a clean pass:

- `format` fails because `package.json` still defines `format:check` as `prettier --check .`, which scans the whole repository, including `.agents/` and other pre-existing files outside the intended repo-owned quality boundary.
- `test` fails because `apps/api/package.json` passes `--no-webstorage` through `NODE_OPTIONS`, and the GitHub Actions Node `24.14.1` runtime rejects that usage.
- `e2e` fails only because upstream required jobs failed first.
- The workflow also logs a Node 20 deprecation warning for `pnpm/action-setup@v4`, which is not the immediate failure but is a near-term maintenance risk.

The goal of this plan is to make the existing PR quality workflow trustworthy and green for valid code PRs while preserving explicit no-op behavior for docs-only changes and conservative full-run behavior for shared or root-owned changes.

## Requirements Trace

- R1. Restore a passing path for non-docs-only PRs through the current `pr-quality` workflow.
- R2. Keep branch-protection-friendly stable job names and explicit no-op semantics intact.
- R3. Prevent external or tool-managed repository content such as `.agents/` from causing false-negative format failures.
- R4. Keep repo-owned source, config, and durable docs under format control.
- R5. Remove the current Node 24 incompatibility from API test execution without weakening actual test coverage.
- R6. Leave `e2e` as a dependent terminal gate; do not treat it as the primary repair target when upstream failures are the true cause.
- R7. Reduce near-term workflow runtime risk by addressing the `pnpm/action-setup` runtime warning in the same stabilization pass if a compatible update is available.
- R8. Keep all changes small, auditable, and aligned with current Turborepo/root-orchestration ownership.

## Scope Boundaries

- Do not redesign the PR scope classifier or the required job topology unless a repair makes that unavoidable.
- Do not re-open the broader rollout decisions already captured in `docs/en/plans/2026-04-12-001-feat-github-pr-quality-ci-plan.md`.
- Do not widen the docs-only optimization or add new skip heuristics beyond what is required to stop false failures.
- Do not introduce new dependencies.
- Do not turn this pass into a repository-wide formatting cleanup unless the chosen repair explicitly requires targeted normalization of repo-owned files still covered by the gate.

## Planning Context

### Relevant Code and Paths

- Repository: `https://github.com/sommio/RSSift`
- Smoke-test PR: `https://github.com/sommio/RSSift/pull/3`
- Verified failing run: `https://github.com/sommio/RSSift/actions/runs/24306566404`
- Workflow: `.github/workflows/pr-quality.yml`
- Command planner: `.github/scripts/pr-quality-command-plan.mjs`
- Root scripts: `package.json`
- API test scripts: `apps/api/package.json`
- Shared Jest config: `packages/jest-config/src/nest.ts`
- Existing rollout plan: `docs/en/plans/2026-04-12-001-feat-github-pr-quality-ci-plan.md`
- Existing workflow learning: `docs/en/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`
- Existing monorepo workflow learning: `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`

### Current Failure Shape

- Local GitHub access context is available for the implementing agent through the repo-root `.env`, which now contains `GH_TOKEN` and `GITHUB_TOKEN` for local tool/API reads. The plan assumes the secret stays local-only, remains gitignored, and is never written into durable docs, committed files, PR text, or workflow YAML.
- The current smoke-test pull request is PR `#3` (`chore/ci-smoke-pr-20260412` -> `develop`), and its failing `pr-quality` run has already been confirmed from local agent tooling.
- `format` currently plans to run `pnpm format:check`, which resolves to `prettier --check .`.
- The current format failure set is not limited to `.agents/`; ignoring `.agents/` alone would still leave repo-owned files failing unless they are reformatted or excluded intentionally.
- `test` currently plans to run `pnpm test` or `pnpm test:root && turbo run test --affected`, both of which eventually execute `apps/api` tests through `NODE_OPTIONS=--no-webstorage jest ...`.
- The current `apps/api` tests pass locally when run without that `NODE_OPTIONS` usage, which suggests the incompatibility is in the invocation strategy, not in the test suite logic itself.

### Institutional Learnings

- `docs/en/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md` reinforces that the workflow should stay explicit, trust-aware, and conservative rather than relying on hidden reviewer assumptions.
- `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md` reinforces that root-owned workflow surfaces should remain thin and auditable.
- `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md` reinforces that durable docs must remain synchronized in English and Chinese.

## Key Technical Decisions

- Repair the workflow by narrowing false-failure surfaces first, not by weakening required jobs or turning failures into soft warnings.
- Treat `.agents/` as non-repo-owned external/tool-managed content for Prettier purposes, and exclude it explicitly instead of relying on contributors to keep it formatted.
- Keep repo-owned code, config, lockfiles, and durable docs inside the format gate; if currently included files fail formatting, normalize those files rather than excluding them by default.
- Remove the `NODE_OPTIONS=--no-webstorage` usage from `apps/api` test entrypoints unless implementation finds a safer Node-24-compatible equivalent with the same intent.
- Treat the `pnpm/action-setup@v4` Node 20 deprecation warning as part of the stabilization backlog for this pass, provided the update remains low-risk and does not require a workflow redesign.
- Treat GitHub verification as part of implementation completion, not a manual follow-up. The implementing agent should use the local `.env` token context to inspect PR `#3`, re-run the relevant workflow/jobs if permissions allow, and confirm whether the repaired branch turns the remote `pr-quality` checks green.

## Open Questions

### Resolved During Planning

- Should `.agents/` be ignored by format? Yes. The user explicitly identified it as external noise, and the current failure profile confirms it does not belong in the branch-protection formatting surface.
- Is `.agents/` the only format problem? No. Repo-owned files still fail formatting and must be handled directly.
- Is `e2e` the thing to fix first? No. It is failing downstream of `format` and `test`.
- Is the `pnpm/action-setup` warning the primary cause of red CI? No. It is a separate maintenance issue.

### Deferred to Implementation

- Whether the format repair is best expressed through `.prettierignore`, a narrower root script, or a combination of both can be finalized during implementation.
- Whether any API test runtime warning remains after removing `NODE_OPTIONS=--no-webstorage` can be evaluated during verification and handled only if it materially affects correctness or CI signal quality.
- The exact action version replacement for `pnpm/action-setup@v4` should be chosen during implementation after confirming an available Node-24-compatible release.
- Whether the available `.env` token also has `Actions: Write` for remote reruns should be confirmed during implementation; if rerun permission is missing, the agent should still use the token for read-back verification and record the remaining limitation explicitly.

## Implementation Units

- [x] **Unit 1: Align the format gate with repo-owned surfaces**

**Goal:** Stop PR quality format failures caused by `.agents/` and other non-owned content while preserving formatting enforcement for repo-owned files.

**Requirements:** R1, R2, R3, R4, R8

**Dependencies:** None

**Files:**

- Modify: `.prettierignore` (create if missing)
- Modify: `package.json` if the final repair needs a narrower root format command
- Test: `package.json`

**Approach:**

- Add an explicit ignore surface for `.agents/` and any other confirmed tool-managed content that should not participate in repo formatting gates.
- Re-run `pnpm format:check` locally to isolate the remaining repo-owned failures.
- Normalize any repo-owned files that remain in scope instead of hiding them behind more ignores unless a path is clearly external/generated.
- Keep the final behavior easy to audit from `package.json` plus `.prettierignore`.

**Patterns to follow:**

- `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`
- `docs/zh-Hans/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`

**Test scenarios:**

- Happy path — `.agents/**` no longer appears in `pnpm format:check` failures.
- Happy path — repo-owned source/config/docs files still participate in format checking.
- Edge case — if additional external/tool-managed paths exist, they are ignored explicitly rather than implicitly.
- Error path — a real repo-owned formatting violation still fails the gate.

**Verification:**

- `pnpm format:check`
- Remote read-back against PR `#3` and its latest `pr-quality` run using the local `.env` token context

- [x] **Unit 2: Make API test entrypoints compatible with CI Node 24**

**Goal:** Remove the current API test invocation incompatibility so the `test` job can pass on GitHub Actions Node `24.14.1`.

**Requirements:** R1, R5, R6, R8

**Dependencies:** Unit 1 can proceed independently; no hard dependency

**Files:**

- Modify: `apps/api/package.json`
- Review: `packages/jest-config/src/nest.ts`
- Review: `apps/api/test/jest-e2e.json`

**Approach:**

- Remove the `NODE_OPTIONS=--no-webstorage` usage from `test` and `test:e2e`, then verify whether Jest still runs correctly in the pure Node test environment already declared by config.
- Only add a replacement mechanism if a concrete regression appears after removal.
- Keep the fix package-local to `apps/api` rather than adding root-level conditionals or workflow-specific overrides.

**Patterns to follow:**

- `packages/jest-config/src/nest.ts`
- `.github/workflows/pr-quality.yml`

**Test scenarios:**

- Happy path — `pnpm --filter api test` passes under the local Node runtime without `NODE_OPTIONS=--no-webstorage`.
- Happy path — `pnpm test` can run through the API package path without hitting the rejected Node option.
- Edge case — API e2e command still resolves correctly after the script change.
- Error path — if removing the flag exposes a real environment regression, the replacement must be explicit and Node-24-compatible rather than restoring the invalid `NODE_OPTIONS` usage.

**Verification:**

- `pnpm --filter api test`
- `pnpm test`
- Remote read-back against PR `#3` and its latest `pr-quality / test` result using the local `.env` token context

- [x] **Unit 3: Remove the workflow runtime deprecation warning**

**Goal:** Eliminate the Node 20 deprecation warning from `pnpm/action-setup` so the workflow is stable against upcoming GitHub Actions runner changes.

**Requirements:** R7, R8

**Dependencies:** None

**Files:**

- Modify: `.github/workflows/pr-quality.yml`

**Approach:**

- Confirm the current supported replacement for `pnpm/action-setup@v4`.
- Update all four call sites in the workflow together so the runtime surface stays consistent.
- Keep the workflow otherwise unchanged unless the new action version requires a minimal syntax adjustment.

**Patterns to follow:**

- `.github/workflows/pr-quality.yml`

**Test scenarios:**

- Happy path — workflow YAML remains valid after the action version update.
- Happy path — pnpm setup semantics stay the same across `format`, `static`, `test`, and `e2e`.
- Error path — if no compatible upgrade path is available, document that explicitly and leave the warning as a known follow-up rather than guessing.

**Verification:**

- Local YAML sanity check by inspection
- Re-run or re-read the affected workflow path in CI for PR `#3` using the local `.env` token context, depending on available token permission

## Sequencing

1. Repair the format surface first so the workflow stops failing on irrelevant content.
2. Repair the API test entrypoints so the `test` job becomes Node-24-compatible.
3. Update `pnpm/action-setup` last because it is low-risk but not the direct cause of the current red build.
4. Verify locally with `pnpm format:check` and `pnpm test` before pushing or rerunning CI.
5. Use the repo-root `.env` token context to inspect PR `#3`, then have the implementing agent re-run the failing remote workflow/jobs when permissions allow and capture the resulting GitHub evidence as part of completion.

## Success Criteria

- A non-docs-only PR can pass `pr-quality / format`, `pr-quality / static`, `pr-quality / test`, and `pr-quality / e2e`.
- `.agents/` no longer creates false-negative format failures.
- `apps/api` tests no longer rely on invalid `NODE_OPTIONS` usage.
- The workflow no longer emits the current `pnpm/action-setup` Node 20 deprecation warning, or the plan explicitly records why that warning remains temporarily unresolved.
