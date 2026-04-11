---
date: 2026-04-11
topic: git-hooks-scheme-a
---

# Git Hooks Scheme A

## Problem Frame

This repository currently has workspace-level quality commands such as `package.json` scripts and `turbo.json` tasks, but it does not yet enforce local Git hook checks before code leaves a developer machine. The goal is to reduce low-quality commits and pushes while keeping the contributor workflow fast enough for day-to-day work in this Turborepo monorepo.

## Requirements

**Local quality gates**

- R1. Before a commit is created, staged files must go through formatting and lint checks only for the files included in the commit. When these checks can safely apply automatic fixes, the updated staged files should remain part of the commit attempt; otherwise the commit must stop with a clear failure signal.
- R2. Before a push is accepted, the workspace must run a repository-level typecheck gate using the existing monorepo task model. The rollout must either ensure all relevant packages participate in that gate or explicitly narrow the gate to the packages that are declared in scope.
- R3. The selected hook flow must not run end-to-end tests.

**Repository alignment**

- R4. The hook workflow must align with existing repository entry points such as `package.json`, `turbo.json`, and package-local scripts rather than introducing a separate task model. Hook-specific helper entry points are allowed only when they remain thin orchestration layers over the existing toolchain.
- R5. The hook workflow must preserve the Turborepo package-boundary approach, where package-local tasks remain the source of truth and root commands act as orchestration entry points.

**Contributor experience**

- R6. Commit-time checks should stay focused on fast, local, staged-file validation to avoid unnecessary slowdown during frequent commits.
- R7. Push-time checks may be slower than commit-time checks, including cases where typecheck execution also triggers upstream build prerequisites from the current task graph, but that behavior must remain understandable and predictable for contributors.

## Success Criteria

- Staged files are formatted and linted before commit completion, and any non-recoverable check failure stops the commit.
- A push is blocked when the workspace typecheck gate fails for the packages included in scope.
- No Git hook in this decision scope runs `test:e2e` or any equivalent end-to-end suite.
- The chosen workflow reuses existing repo-relative entry points instead of creating an ad hoc parallel quality pipeline.

## Scope Boundaries

- This decision covers only local Git hooks for code quality gates.
- This decision does not define exact tool configuration, file contents, or command syntax.
- This decision does not change CI policy, deployment behavior, or release workflow.
- This decision does not add commit message rules or additional hook types beyond the quality-gate path under discussion.

## Key Decisions

- Scheme A is selected: commit-time checks are limited to staged formatting and linting, while workspace typechecking moves to push-time.
- Repository-wide typechecking is intentionally excluded from `pre-commit` to keep commit latency acceptable in a monorepo workflow.
- End-to-end coverage remains outside local hook enforcement and stays available through existing non-hook workflows.

## Dependencies / Assumptions

- Existing repo-relative quality entry points in `package.json` and `turbo.json` remain the basis for hook integration.
- A thin hook-specific orchestration entry may be introduced if staged-file behavior cannot be expressed cleanly through the current root scripts alone.
- Package-local task coverage may need to be completed in places where workspace scripts are still inconsistent, such as `packages/ui/package.json` lacking local `lint` and `typecheck` scripts.
- The current `typecheck` task graph may trigger upstream `build` prerequisites, and that behavior is acceptable unless planning chooses to change the task graph explicitly.
- CI continues to provide full-repository validation beyond what local hooks cover.

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical] Which hook manager should own the final implementation surface for this repo.
- [Affects R1][Technical] Which staged-file command mapping should be used for formatting and linting.
- [Affects R2][Technical] How the push-time hook should invoke the root workspace typecheck entry point while preserving the repository-level requirement.
- [Affects R2][Technical] Which packages must be brought into typecheck coverage as part of the rollout.
- [Affects R4][Technical] Whether package task coverage should be normalized before or during hook rollout.

## Next Steps

-> /ce:plan for structured implementation planning
