---
title: 保持 monorepo Husky hooks 的 package-aware 路由与稳定自举
date: 2026-04-11
category: workflow-issues
module: local quality gates
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - 在 monorepo 中接入 husky 与 lint-staged
  - 各 package 持有自己的 eslint 配置
  - pre-commit 只应处理 staged 文件，而 pre-push 负责更重的检查
  - fresh install 后必须稳定启用 git hooks
tags: [husky, lint-staged, monorepo, eslint, git-hooks, turbo, staged-files]
---

# 保持 monorepo Husky hooks 的 package-aware 路由与稳定自举

## Context

我们为这个 Turborepo monorepo 接入本地质量门禁时，希望把职责拆清楚：`pre-commit` 只处理 staged 文件，`pre-push` 复用现有的 workspace `typecheck`。目标是在不做全仓扫描的前提下，尽快给出提交前反馈，同时又不绕过 `apps/web`、`apps/api` 以及未来其他 package 自己维护的 ESLint 规则。

实际接线时暴露出两个工作流问题。

第一个问题出在 `lint-staged.config.mjs`。原来的路由逻辑假设 `lint-staged` task function 收到的是 workspace 相对路径，并且只特判了 `apps/web`。但真实输入是绝对路径，所以 `apps/web` 的文件会悄悄落回 root ESLint；`apps/api` 也完全没有走 package-local ESLint，而是统一回退到 root ESLint。

第二个问题出在 Husky 自举。这个仓库一度留下了坏掉的 `core.hooksPath`，导致 partially staged 提交可能在真正的 staged-file 检查开始前先失败。实际恢复方式是重新执行 Husky 安装，让 `.husky/_` 与 `core.hooksPath=.husky/_` 回到正确状态；现在仓库则通过 `"prepare": "husky .husky"` 把这条安装路径显式固定下来。

## Guidance

在 monorepo 中接 Git hooks 时，要把它当成“按 package 边界编排”的工作流，而不是把 root 命令包一层就结束。

这次修复后，仓库里稳定下来的模式是：

1. 不再写死路径前缀，而是从文件系统自动发现 package-local ESLint 的归属。
2. 所有 staged 文件先做路径归一化，因为 `lint-staged` task function 可能收到绝对路径。
3. 只要某个 package 持有自己的 `eslint.config.mjs`，就必须从该 package 目录执行 ESLint。
4. root ESLint 只作为兜底，处理那些不属于 package-local ESLint surface 的文件。
5. Husky 安装路径保持显式，确保 fresh install 后恢复 `.husky/_`，并把 `core.hooksPath` 收敛到 `.husky/_`。
6. `pre-commit` 保持 staged-only 的 format/lint，`pre-push` 再承担较重的 workspace `typecheck`。

这次修复的核心不是某个具体 helper 名字，而是“按 package 所有权分发”：

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

只要命中了 package-local ESLint，就必须在那个 package 目录里执行：

```sh
pnpm --dir 'apps/api' exec eslint --fix --max-warnings 0 'src/app.module.ts'
pnpm --dir 'apps/web' exec eslint --fix --max-warnings 0 'app/page.tsx'
```

Husky 的恢复/安装改动则故意保持最小：

```json
{
  "scripts": {
    "prepare": "husky .husky"
  }
}
```

## Why This Matters

这类问题最危险的地方在于它会制造“看起来已经有门禁”的假安全感。Hook 在跑，终端也有输出，提交甚至可能成功，但真正生效的并不是 package 自己定义的 ESLint 规则。在 monorepo 里，这意味着包级规则可能被静默绕过，未来新增带 `eslint.config.mjs` 的 package 也可能永远进不了 hook 路径。

Husky 自举问题虽然故障形态不同，但后果一样：工作流不再可信。如果 `.husky/_` 与 `core.hooksPath` 不能稳定恢复，fresh install 和 partially staged 提交就会变成环境相关问题，本地质量门禁会退化成“有时生效的脚本”。

## When to Apply

- 仓库在 monorepo 中使用 `lint-staged`，且存在 package-local ESLint
- `apps/` 与 `packages/` 持有不同框架或包级 lint 规则
- `pre-commit` 需要保持 staged-only
- `pre-push` 负责更重的 workspace 级检查，例如 `typecheck`
- 仓库刚引入 Husky，或正在调整 hooks 激活链路

如果仓库确实只有一套全局 ESLint 配置、没有 package-local lint 入口，就不需要引入这层复杂度；但只要存在 package-local ESLint，package-aware 分发就应该成为默认做法。

## Examples

最初那种只特判一个 app 的写法过于脆弱，因为它既假设了 repo-relative path，也只认识单一目录：

```js
if (file.startsWith("apps/web/")) {
  return [`pnpm --dir apps/web exec eslint --fix --max-warnings 0 ...`];
}

return [`eslint --fix --max-warnings 0 ...`];
```

修正后的做法会先归一化路径，再找出所属 package；只有找不到 package-local ESLint 时才回退到 root 命令。

这类修复的验收也必须同时覆盖 package 路由和真实 hook 行为，而不是只看某条命令能不能运行。一个足够好的 smoke pass 至少应确认：

- `apps/api` 与 `apps/web` staged 文件的 package-aware 派发
- hook 配置本身可提交，包括 `lint-staged.config.mjs`
- fresh install 后通过 `.husky/_` 与 `core.hooksPath=.husky/_` 成功激活 hooks
- 真实 `git commit` / `git push` 行为，同时覆盖成功与拦截场景

## Related

- `lint-staged.config.mjs`
- `package.json`
- `.husky/pre-commit`
- `.husky/pre-push`
- `docs/en/brainstorms/2026-04-11-git-hooks-scheme-a-requirements.md`
- `docs/zh-Hans/brainstorms/2026-04-11-git-hooks-scheme-a-requirements.md`
- `docs/en/plans/2026-04-11-001-feat-husky-local-quality-gates-plan.md`
- `docs/zh-Hans/plans/2026-04-11-001-feat-husky-local-quality-gates-plan.md`
