---
title: Keep tool-managed and generated files out of Prettier gates
date: 2026-04-17
category: workflow-issues
module: format gate boundaries
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - the repo uses `prettier --check .` or another root-wide format gate
  - CI failures point at lockfiles or other generated artifacts
  - a file is managed by package managers or external tooling instead of humans
  - format churn is creating noisy reviews without semantic changes
  - maintainers are deciding whether to widen `.prettierignore`
tags:
  [
    prettier,
    prettierignore,
    pnpm-lock,
    lockfile,
    ci,
    generated-files,
    tool-managed,
    formatting,
  ]
---

# Keep tool-managed and generated files out of Prettier gates

## Context

This repo uses the root command `pnpm format:check`, which currently resolves to
`prettier --check .`. That makes `.prettierignore` part of the quality-gate
boundary, not just an editor convenience.

A recent CI failure showed why this boundary matters. The `pr-quality / format`
job failed only because `pnpm-lock.yaml` did not match Prettier's preferred YAML
layout. The lockfile change was formatting-only, extremely large, and had no
behavioral value. That made the gate noisy and pushed attention away from the
real repo-owned surfaces.

## Guidance

Do not casually include tool-managed or generated files in a repo-wide Prettier
gate.

If a file's source of truth is an external tool, prefer letting that tool own
its shape and keep the file out of `prettier --check .` unless there is a
strong repository-specific reason to do otherwise.

For this repo, `pnpm-lock.yaml` should be treated like a package-manager-owned
artifact:

- keep it committed for reproducible installs and cache correctness
- let `pnpm` update it when dependencies change
- keep it out of the root Prettier gate to avoid large, non-semantic diffs
- express that boundary explicitly in `.prettierignore`

The practical rule is simple: format gates should target repo-owned content,
not every tracked file.

## Why This Matters

Formatting gates become misleading when they fail on files that humans are not
expected to shape directly.

In this case, the immediate CI red signal looked like a formatting regression,
but the underlying issue was boundary drift: the gate was checking a file owned
by `pnpm`, not by the repo's formatting conventions. That kind of drift creates
three problems:

- reviewers see huge lockfile diffs with no meaningful behavior change
- follow-up jobs can fail downstream, which makes root-cause reading slower
- engineers can start "fixing" generated files instead of fixing the gate
  boundary

A repo-wide formatting rule is only trustworthy when its scope matches the set
of files the team actually intends to maintain by hand.

## When to Apply

- When CI format failures point at `pnpm-lock.yaml`, generated manifests, or
  other machine-owned files
- When a root format command such as `prettier --check .` is broader than the
  repository's true ownership boundary
- When adding new tool-managed directories or artifacts to the repo
- When deciding whether a noisy format failure should be fixed by reformatting
  a file or by tightening `.prettierignore`
- When review churn is growing because formatting touches generated outputs

## Examples

Bad boundary:

```gitignore
# .prettierignore
.agents/
.cache/
.claude/
.codex/
.omx/
.turbo/
tmp/
```

With that setup, the root format gate still checks `pnpm-lock.yaml`:

```json
{
  "scripts": {
    "format:check": "prettier --check ."
  }
}
```

Better boundary:

```gitignore
# .prettierignore
.agents/
.cache/
.claude/
.codex/
.omx/
.turbo/
pnpm-lock.yaml
tmp/
```

Good mental model:

```text
Track the lockfile in git.
Let pnpm regenerate it.
Do not use Prettier to manufacture giant lockfile-only diffs.
```

## Related

- `docs/en/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`
- `docs/zh-Hans/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`
- `.prettierignore`
- `package.json`
- `pnpm-lock.yaml`
