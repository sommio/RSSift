---
title: 让生成型 API contract 输出留在 ESLint gate 之外
date: 2026-05-08
category: workflow-issues
module: api contract lint boundary
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - 生成型 API client 或类似产物落在 workspace 目录里
  - 仓库级 lint 的范围已经宽到会扫描生成输出
  - cache 命中让你开始怀疑是假绿或假红
  - `.gitignore` 和 ESLint ignore 需要保持对齐
symptoms:
  - 一旦把 `packages/api-contract/src/generated/**` 放回 ESLint scope，`pnpm lint` 就会在 `packages/api-contract/src/generated/api-client.ts` 上失败
root_cause: scope_issue
resolution_type: config_change
tags:
  [eslint, turbo, generated-files, api-contract, cache, lint-gates]
---

# 让生成型 API contract 输出留在 ESLint gate 之外

## Context

我们一开始怀疑是 Turbo cache 的问题，因为之前在 `develop` 上有一
次看起来已经变绿的跑法，而且 task graph 本身也在用缓存输入。但做
了一次干净的 `--force` 重跑之后，绿灯是成立的。只有当
`packages/api-contract/src/generated/**` 重新进入 ESLint scope 时，
红灯才会出现。

真正报错的文件是 `packages/api-contract/src/generated/api-client.ts`，
不是 `apps/api/src/generated/prisma` 下面的 Prisma client。这个生成出
来的 API contract client 里本来就还有真实的 ESLint violation，所以
把它纳入 lint，等于把生成产物变成了仓库门禁。

## Guidance

当生成器负责文件形状，而仓库又不打算手工维护那份文件时，就把生
成型 contract 输出留在仓库级 ESLint scope 之外。

在这个仓库里，这意味着两个边界都要同步维护：

- `packages/eslint-config/base.js` 要忽略 `packages/api-contract/src/generated/**`
- `.gitignore` 也要忽略这个生成目录，这样 git 才不会变脏

如果某个 lint 结果看起来不对，先把 cache 和真正执行分开，再去怀
疑 hash collision：

```bash
pnpm lint --force
pnpm exec eslint --no-ignore packages/api-contract/src/generated/api-client.ts --max-warnings 0
```

如果直接 lint 还是失败，那就不是 cache-key collision，而是 scope
本身有问题。

## Why This Matters

Turbo 只能回放它已经看见过的输入对应的任务结果，不能把生成型文
件本身变得 lint-clean。所以，某次缓存里的绿灯，并不等于这个生成
输出真的适合放进 lint gate。

把 ignore 边界写清楚，可以避免三种漂移：

- 由 `pnpm generate` 或 Orval 拥有的生成文件开始阻塞 CI
- cache 疑云把真正的修复方向拖得更久
- `.gitignore` 和 ESLint 渐渐分叉，一边看起来干净，另一边还在报错

正确的修法，是让 lint surface 和仓库 ownership 对齐，而不是把
gate 一直扩宽到生成输出也算“人人都该手改”的文件。

## When to Apply

- 当某个 package-local generator 会把输出写进 source tree 时
- 当仓库级 lint 比人工维护文件的范围更宽时
- 当一次 green 的缓存命中之后，又在 clean rerun 里变红时
- 当 `.gitignore` 变了，但 ESLint 仍然会遍历生成目录时

## Examples

坏边界：

```js
// packages/eslint-config/base.js
ignores: ["apps/api/src/generated/**"];
```

这样会把 `packages/api-contract/src/generated/api-client.ts` 留在
ESLint scope 里。

更好的边界：

```js
// packages/eslint-config/base.js
ignores: [
  "apps/api/src/generated/**",
  "packages/api-contract/src/generated/**",
];
```

同时保留对应的 git ignore：

```gitignore
# .gitignore
apps/api/src/generated/
packages/api-contract/src/generated/
```

直接探测：

```bash
pnpm exec eslint --no-ignore packages/api-contract/src/generated/api-client.ts --max-warnings 0
```

当你想确认 failure 是真实存在，而不是 cache replay 的副作用时，
这个探测很有用。

## Related

- `docs/zh-Hans/solutions/workflow-issues/prettier-gates-should-ignore-tool-managed-and-generated-files-2026-04-17.md`
- `docs/zh-Hans/solutions/workflow-issues/api-test-surfaces-and-package-local-eslint-guardrails-2026-04-16.md`
- `packages/eslint-config/base.js`
- `packages/api-contract/src/generated/api-client.ts`
- `.gitignore`
