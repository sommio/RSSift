---
title: Keep monorepo Husky hooks package-aware and bootstrap-stable
date: 2026-04-11
category: workflow-issues
module: local quality gates
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - wiring husky and lint-staged into a monorepo
  - packages own their own eslint configuration
  - pre-commit should stay staged-only while pre-push runs heavier checks
  - fresh installs must activate git hooks reliably
tags: [husky, lint-staged, monorepo, eslint, git-hooks, turbo, staged-files]
---

# Keep monorepo Husky hooks package-aware and bootstrap-stable

## Context

We introduced local quality gates for this Turborepo monorepo with a clear split: `pre-commit` should only touch staged files, while `pre-push` should reuse the existing workspace `typecheck`. The intended behavior was lightweight commit-time feedback without bypassing package-local lint rules in `apps/web`, `apps/api`, and any future package that owns its own ESLint config.

Two workflow bugs made that setup unreliable.

The first bug lived in `lint-staged.config.mjs`. The routing logic assumed `lint-staged` task functions would receive workspace-relative paths and only special-cased `apps/web`. In practice, `lint-staged` passed absolute paths, so `apps/web` files silently fell back to the root ESLint command. `apps/api` files also fell back to root ESLint because they were never routed to package-local ESLint at all.

The second bug lived in the Husky bootstrap step. This repo had ended up with a bad `core.hooksPath`, so partially staged commits could fail before the actual staged-file checks had a chance to run. The practical recovery was to rerun Husky installation so `.husky/_` and `core.hooksPath=.husky/_` were restored, and the repo now keeps that path explicit via `"prepare": "husky .husky"`.

## Guidance

Treat monorepo Git hooks as package-aware orchestration, not as root-only lint wrappers.

For this repo, the stable pattern is:

1. Discover package-local ESLint ownership from the filesystem instead of hard-coding path prefixes.
2. Normalize every staged file path before routing because `lint-staged` task functions may receive absolute paths.
3. Run ESLint from the owning package directory when that package has its own `eslint.config.mjs`.
4. Keep the root ESLint command as a fallback only for files that do not belong to a package-local ESLint surface.
5. Keep the Husky install path explicit so fresh installs restore `.husky/_` and converge `core.hooksPath` to `.husky/_`.
6. Keep `pre-commit` focused on staged formatting/linting and reserve heavier workspace checks like `typecheck` for `pre-push`.

The key invariant is package ownership, not any one helper name or folder list:

```js
for (const file of normalizedFiles) {
  const packageDir = findOwningEslintPackageDir(file);
  if (packageDir === null) rootFiles.push(file);
  else
    packageFiles.set(packageDir, [
      ...(packageFiles.get(packageDir) ?? []),
      file,
    ]);
}
```

When a package owns its lint config, the command must run from that package rather than from the workspace root:

```sh
pnpm --dir 'apps/api' exec eslint --fix --max-warnings 0 'src/app.module.ts'
pnpm --dir 'apps/web' exec eslint --fix --max-warnings 0 'app/page.tsx'
```

The Husky recovery/install step stays intentionally small:

```json
{
  "scripts": {
    "prepare": "husky .husky"
  }
}
```

## Why This Matters

This class of failure creates false confidence: the hook runs, terminal output appears, and commits may still succeed, but the wrong ESLint configuration is enforcing the gate. In a monorepo that means package-specific rules can be skipped silently, and future packages with their own `eslint.config.mjs` may never join the hook path unless routing follows package ownership.

The Husky side has the same trust problem in a different form. If `.husky/_` and `core.hooksPath` are not restored consistently, fresh installs and partially staged commits become environment-sensitive, which turns a local quality gate into a sometimes-on script.

## When to Apply

- When a monorepo uses `lint-staged` with package-local ESLint configs
- When `apps/` and `packages/` own different framework-specific lint rules
- When `pre-commit` should only process staged files
- When `pre-push` should run heavier workspace-level checks such as `typecheck`
- When Husky is newly introduced or reworked and fresh-install activation matters

If the repository truly has one shared ESLint config and no package-local lint entry points, this pattern is unnecessary. Once package-local ESLint exists, package-aware dispatch should become the default.

## Examples

The original special-case approach was too narrow because it assumed repo-relative paths and only understood one app:

```js
if (file.startsWith("apps/web/")) {
  return [`pnpm --dir apps/web exec eslint --fix --max-warnings 0 ...`];
}

return [`eslint --fix --max-warnings 0 ...`];
```

The corrected approach first normalizes the incoming path, then resolves package ownership, and only falls back to the root command when no package-local ESLint surface exists.

The validation for this fix should also be package-aware and hook-aware, not just command-aware. A good smoke pass should confirm:

- package-aware dispatch for staged files in `apps/api` and `apps/web`
- self-lintability of the hook config, including `lint-staged.config.mjs`
- fresh-install hook activation via `.husky/_` and `core.hooksPath=.husky/_`
- real `git commit` and `git push` behavior, including both success and blocking cases

## Related

- `lint-staged.config.mjs`
- `package.json`
- `.husky/pre-commit`
- `.husky/pre-push`
- `docs/en/brainstorms/2026-04-11-git-hooks-scheme-a-requirements.md`
- `docs/zh-Hans/brainstorms/2026-04-11-git-hooks-scheme-a-requirements.md`
- `docs/en/plans/2026-04-11-001-feat-husky-local-quality-gates-plan.md`
- `docs/zh-Hans/plans/2026-04-11-001-feat-husky-local-quality-gates-plan.md`
