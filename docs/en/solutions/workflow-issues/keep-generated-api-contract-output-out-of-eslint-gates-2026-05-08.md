---
title: Keep generated API contract output out of ESLint gates
date: 2026-05-08
category: workflow-issues
module: api contract lint boundary
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - a generated API client or similar artifact lives under the workspace tree
  - repo lint is broad enough to scan generated output
  - cache hits make you suspect a false green or false red
  - `.gitignore` and ESLint ignore rules need to stay aligned
symptoms:
  - `pnpm lint` fails on `packages/api-contract/src/generated/api-client.ts` once the file is included in ESLint scope
root_cause: scope_issue
resolution_type: config_change
tags:
  [eslint, turbo, generated-files, api-contract, cache, lint-gates]
---

# Keep generated API contract output out of ESLint gates

## Context

We first suspected a Turbo cache problem because a previous run on `develop`
looked green, and the task graph was already using cached inputs. But a clean
forced rerun showed the green state was real. The red only appeared when
`packages/api-contract/src/generated/**` was brought back into ESLint scope.

The failing file was `packages/api-contract/src/generated/api-client.ts`, not
the Prisma client under `apps/api/src/generated/prisma`. The generated API
contract client still contains real ESLint violations, so linting it directly
turns a generated artifact into a repo gate.

## Guidance

Keep generated contract output out of repo-wide ESLint scope when the generator
owns the file shape and the repo does not intend to hand-maintain that file.

In this repo, that means keeping both boundaries in sync:

- `packages/eslint-config/base.js` should ignore `packages/api-contract/src/generated/**`
- `.gitignore` should also ignore the generated directory so git stays clean

If a lint result looks suspicious, separate cache from execution before chasing
hash collisions:

```bash
pnpm lint --force
pnpm exec eslint --no-ignore packages/api-contract/src/generated/api-client.ts --max-warnings 0
```

If the direct lint still fails, the problem is not a cache-key collision. It is
an input-scope problem.

## Why This Matters

Turbo can only replay a task result for the inputs it saw. It cannot make a
generated file lint-clean. That means a cached green run is not proof that the
generated output belongs in the lint gate.

Keeping the ignore boundary explicit avoids three kinds of drift:

- generated files that are owned by `pnpm generate` or Orval start blocking CI
- cache suspicion hides the real fix for longer than necessary
- `.gitignore` and ESLint drift apart, so one boundary looks clean while the
  other still fails

The right fix is to keep the lint surface aligned with repo ownership, not to
expand the gate until generated output becomes somebody else's problem.

## When to Apply

- When a package-local generator writes output under the source tree
- When repo lint is broader than the manually maintained files
- When a green cached run is followed by a red clean rerun
- When `.gitignore` changes but ESLint still traverses the generated directory

## Examples

Bad boundary:

```js
// packages/eslint-config/base.js
ignores: ["apps/api/src/generated/**"];
```

That leaves `packages/api-contract/src/generated/api-client.ts` inside ESLint
scope.

Better boundary:

```js
// packages/eslint-config/base.js
ignores: [
  "apps/api/src/generated/**",
  "packages/api-contract/src/generated/**",
];
```

And keep the matching git ignore:

```gitignore
# .gitignore
apps/api/src/generated/
packages/api-contract/src/generated/
```

Direct probe:

```bash
pnpm exec eslint --no-ignore packages/api-contract/src/generated/api-client.ts --max-warnings 0
```

That probe is useful when you want to confirm that the failure is real and not
just a cache replay artifact.

## Related

- `docs/en/solutions/workflow-issues/prettier-gates-should-ignore-tool-managed-and-generated-files-2026-04-17.md`
- `docs/en/solutions/workflow-issues/api-test-surfaces-and-package-local-eslint-guardrails-2026-04-16.md`
- `packages/eslint-config/base.js`
- `packages/api-contract/src/generated/api-client.ts`
- `.gitignore`
