---
title: 让 monorepo 的 PR 质量 CI 同时具备可信判定、稳定 no-op 与可自举边界
date: 2026-04-12
category: workflow-issues
module: pr quality ci
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - 在 monorepo 中搭建仅针对 pull request 的质量工作流
  - branch protection 依赖稳定的 required job 名称
  - 工作流需要区分 docs-only、app-local 与 shared change
  - turbo remote cache 只能在可信的同仓库上下文中启用
  - app 依赖的共享 package 开始导出构建产物
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

# 让 monorepo 的 PR 质量 CI 同时具备可信判定、稳定 no-op 与可自举边界

## Context

我们为这个 Turborepo monorepo 落地了一套只在 pull request 上运行的 GitHub Actions 质量工作流，同时需要满足两个约束：

- branch protection 必须始终收到稳定的 required checks
- 一旦信任边界、变更范围或 package 边界不清晰，工作流必须保守回退

最终形成的实现跨越了 `.github/workflows/pr-quality.yml`、`.github/scripts/` 下的 helper 脚本、`package.json` 中的 root 任务接线，以及 `packages/ui` 的共享边界。

这次沉淀下来的核心并不是某一个孤立修复，而是一种能在验证后仍然保持可用的工作流形状：

- 先用可信基线代码做 scope 判定，再执行 PR 分支命令
- 对 docs-only pull request 显式给出 no-op success，而不是让 required checks 被跳过
- scope 分类必须保留 deleted files，并在不确定时保守回退
- Turbo remote cache 只允许在可信的同仓库 pull request 上启用
- 共享 package 一旦成为真实边界，就要为本地 app 流程显式提供自举

## Guidance

对这个仓库来说，稳定模式是：

1. 编排逻辑保留在 GitHub Actions YAML 里，但把分支较多的 scope/command 决策下沉到体积很小、可测试的 helper 脚本中。
2. 在 checkout 候选 PR 分支之前，先从 trusted base 代码执行 scope 判定和命令规划。
3. docs-only pull request 也要收敛成显式成功的 job，避免 required checks 长时间 pending。
4. 只有当改动严格落在 app-local surface 时才使用 affected mode；只要碰到共享 package、根级配置或任何不明确情况，就回退到 full-repo gate。
5. Turbo remote cache 只能在同仓库 PR 且同时具备 `TURBO_TOKEN` 与 `TURBO_TEAM` 时启用。
6. 如果共享 package 变成了构建边界，下游 app 必须为本地 `dev`、`build`、`typecheck`、`test` 流程显式自举它。
7. 当 clean checkout 时构建产物可能不存在，direct Jest 解析就应该指向可直接解析的 source surface。

信任边界必须写进工作流，而不能只存在于维护者脑中。现在的 workflow 会先把 base SHA checkout 到 `.trusted-base`，再从那里运行策略 helper，然后才会碰 PR 分支代码：

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

scope helper 需要保持保守：docs-only 归为 `noop`，仅 app-local 改动归为 `affected`，其他一律归为 `full`。当它回退到 git diff 时，也必须把 deleted files 算进去：

```js
const stdout = execFileSync(
  "git",
  ["diff", "--name-only", "--diff-filter=ACMRD", `${base}...${head}`],
  { encoding: "utf8" },
);
```

command planner 也要把 docs-only 的行为显式编码出来，而不是依赖 job 被跳过：

```js
if (docsOnly || runMode === "noop") {
  return {
    should_run: false,
    reason: "docs-only-noop",
  };
}
```

当 `@repo/ui` 开始导出构建产物后，本地 web app 流程也必须有明确的自举步骤：

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

同时，direct Jest 运行不应依赖预先存在的 `packages/ui/dist`：

```ts
moduleNameMapper: {
  '^@repo/ui$': '<rootDir>/../../packages/ui/src/index.ts',
  '^@repo/ui/(.*)$': '<rootDir>/../../packages/ui/src/$1',
}
```

## Why This Matters

这套模式防止的是一类很隐蔽的“假稳定”。

如果 docs-only PR 在工作流入口就被跳过，required checks 可能永远 pending；如果信任敏感的策略逻辑从 PR 分支运行，PR 就部分参与了“如何审判自己”；如果 scope 分类不包含 deleted files，删除代码再顺带改文档就可能误判成 docs-only；如果本地 app 流程依赖残留的 `dist`，共享 package 边界其实只是碰巧可用。

把这些约束编码成可执行规则后，整个工作流会更可审计、更可预测：

- branch protection 能稳定绑定 `pr-quality / format`、`pr-quality / static`、`pr-quality / test`、`pr-quality / e2e`
- remote cache 变成性能优化，而不是正确性前提
- 共享 package 边界在 CI 与 clean checkout 本地环境里表现一致
- app-local 改动可以更快，但不会把这种优化错误放大到 shared/root change

## When to Apply

- monorepo 需要一套仅针对 PR 的 CI，且 required checks 名称必须稳定
- 工作流需要根据 docs-only、app-local、shared/root 等范围做不同处理
- `--affected` 只能选择性使用，不能无差别推广到所有 gate
- Turbo remote cache 这类 secret 驱动能力不能暴露给不可信 PR
- 某个共享 package 从 source-only export 变成 emitted-artifact export
- app 级本地命令可能绕过 root task graph，因此需要显式 bootstrap

如果仓库既没有 branch protection，也没有 helper-script policy，更没有构建型共享边界，就不一定需要完整引入这套模式；但一旦这些约束存在，把它们直接写进工作流通常比依赖口头约定更可靠。

## Examples

这次 rollout 在仓库里最终由这些具体部分协同实现：

- `.github/workflows/pr-quality.yml` 保留稳定 job 名、显式 docs-only no-op step、trusted-base scope 判定，以及仅同仓库可用的 cache env 接线。
- `.github/scripts/pr-quality-scope.mjs` 负责把改动分类为 `noop`、`affected`、`full`，并通过 `--diff-filter=ACMRD` 保留 deleted files。
- `.github/scripts/pr-quality-command-plan.mjs` 让 job 规划可审计，并让 docs-only job 以显式成功结束，而不是假装真正执行过工作。
- `package.json` 通过 `test:root` 把 root helper tests 纳入仓库验证。
- `packages/ui/package.json` 与 `packages/ui/tsconfig.build.json` 把 `@repo/ui` 变成会输出 JS 与 `.d.ts` 的真实构建边界。
- `apps/web/package.json` 与 `apps/web/jest.config.ts` 通过自举 `@repo/ui` 并把 direct Jest 指向 `packages/ui/src`，保证 clean checkout 的开发流程仍然可用。

这类模式的验收至少应覆盖：

- scope 与 command planning 的 helper-script tests
- workflow 语法校验
- docs-only、app-local、shared/root 三类改动的分类检查
- clean checkout 下本地 app `build`、`typecheck`、`test` 的实际行为

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
