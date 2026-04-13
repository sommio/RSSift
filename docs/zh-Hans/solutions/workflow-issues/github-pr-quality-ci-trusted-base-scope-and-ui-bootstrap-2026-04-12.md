---
title: 让 monorepo 的 PR 质量 CI 同时具备可信判定、稳定 no-op 与可自举边界
date: 2026-04-12
last_updated: 2026-04-13
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
  - GitHub 托管 Node 运行时升级可能让既有 workflow 假设失效
  - 需要把 remote cache 预热和真实命中分开验证
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

# 让 monorepo 的 PR 质量 CI 同时具备可信判定、稳定 no-op 与可自举边界

## Context

我们为这个 Turborepo monorepo 落地了一套只在 pull request 上运行的 GitHub Actions 质量工作流，同时需要满足三个约束：

- branch protection 必须始终收到稳定的 required checks
- 一旦信任边界、变更范围或 package 边界不清晰，工作流必须保守回退
- GitHub 托管运行时升级不能悄悄让脚本、action 版本或缓存假设失效

这两份 handoff 记录下来的稳定化改动，核心集中在 `.github/workflows/pr-quality.yml`、`apps/api/package.json` 和 `.prettierignore`；而 `.github/scripts/` 中既有的 helper-script 设计，以及 `README.md` / `README.zh-Hans.md` 里的维护者说明，则构成了这次工作流判断的上下文。

这次沉淀下来的核心并不是某一个孤立修复，而是一种在真实 smoke run 失败和后续验证后仍然成立的工作流形状：

- 先用 trusted base 逻辑做 scope 判定，再执行 PR 分支命令
- 对 docs-only pull request 显式给出 no-op success，而不是让 required checks 被跳过
- scope 分类必须保留 deleted files，并在不确定时保守回退
- Turbo remote cache 只允许在可信的同仓库 pull request 上启用
- 当 GitHub 提升 Node 运行时基线时，要审计 workflow 里的每一个 JavaScript-based action
- remote cache 需要分两阶段验证：先确认预热，再在下一次相同 rerun 中看到明确的 cache hit
- 安全分析里要把“公开仓库可见”与“same-repo PR 执行上下文可接触 secrets”分开讨论

## Guidance

对这个仓库来说，稳定模式是：

1. 编排逻辑保留在 GitHub Actions YAML 里，但把分支较多的 scope/command 决策下沉到体积很小、可测试的 helper 脚本中。
2. 在 checkout 候选 PR 分支之前，先从 trusted base 代码执行 scope 判定和命令规划。
3. docs-only pull request 也要收敛成显式成功的 job，避免 required checks 长时间 pending。
4. 只有当改动严格落在 app-local surface 时才使用 affected mode；只要碰到共享 package、根级配置、workflow 或任何不明确情况，就回退到 full-repo gate。
5. Turbo remote cache 只能在同仓库 PR 且同时具备 `TURBO_TOKEN` 与 `TURBO_TEAM` 时启用。
6. 要把 `.prettierignore` 和 package 级测试脚本视为 workflow 输入的一部分；如果它们与仓库拥有边界或 runner 运行时行为漂移，CI 结果就会变得嘈杂或误导。
7. 一旦 GitHub 对某个 JavaScript-based action 抛出 Node 运行时 warning，不要只升级第一个告警点；应把整个 workflow 中所有 JavaScript-based action 一起审计一遍。
8. remote cache 必须分两次证明：一次 rerun 可能只是把 cache 预热好，只有下一次同输入 rerun 里出现明确的 `cache hit` 日志，才能算真正验证完成。
9. 像 Jest `--localstorage-file` teardown warning 这样的本地非阻塞噪声，应与主 CI 健康叙事分开，除非它已经开始让门禁失败。

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

workflow 还必须跟当前 GitHub 托管的 Node 运行时保持一致。这次 rollout 中，这意味着要从 API 测试脚本里移除已失效的 Node 选项，并把 JavaScript-based actions 升级出 Node 20 时代的运行时：

```json
{
  "scripts": {
    "test": "jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json --runInBand"
  }
}
```

```yaml
- uses: pnpm/action-setup@v5
- uses: actions/github-script@v8
```

remote cache 的验证也不能只看一次 rerun 变绿。在这个仓库里，run `24308312552` 整体已经全绿；但就 cache 证据而言，attempt 2 只能证明 remote cache 已启用并开始预热，attempt 3 才第一次在 `static`、`test`、`e2e` 中出现真实 cache hit 和日志回放。

## Why This Matters

这套模式防止的是一类很隐蔽的“假稳定”。

如果 docs-only PR 在工作流入口就被跳过，required checks 可能永远 pending；如果信任敏感的策略逻辑从 PR 分支运行，PR 就部分参与了“如何审判自己”；如果 scope 分类不包含 deleted files，删除代码再顺带改文档就可能误判成 docs-only；如果 action 版本落后于 GitHub 的 Node 基线，CI 可能在下次运行时升级前都看起来健康；如果 remote cache 只是被写入却从未读回，维护者就会高估性能收益；如果安全分析把“公开可见”与“执行上下文信任”混在一起，真正剩余的风险点反而会被遮住。

把这些约束编码成可执行规则后，整个工作流会更可审计、更可预测：

- branch protection 能稳定绑定 `pr-quality / format`、`pr-quality / static`、`pr-quality / test`、`pr-quality / e2e`
- remote cache 变成性能优化，而不是正确性前提
- action runtime 升级成为 workflow 维护的一部分，而不是临时救火
- 共享 package 边界在 CI 与 clean checkout 本地环境里表现一致
- fork PR 继续有意以 uncached 方式运行，而 same-repo PR secret exposure 则被明确保留为剩余信任决策

公开仓库并不等于 Turbo secrets 自动泄漏。更准确的说法是：在当前 `pull_request` 设计下，fork PR 依旧会被挡在 cache secrets 之外，但 same-repository PR 的执行上下文仍然需要被信任，因为这些 job 可能接收到 `TURBO_TOKEN` 与 `TURBO_TEAM`。

## When to Apply

- monorepo 需要一套仅针对 PR 的 CI，且 required checks 名称必须稳定
- 工作流需要根据 docs-only、app-local、shared/root 等范围做不同处理
- `--affected` 只能选择性使用，不能无差别推广到所有 gate
- Turbo remote cache 这类 secret 驱动能力不能暴露给不可信 PR
- GitHub 托管 Node 运行时变化可能让 package 脚本或 JavaScript-based action 版本失效
- 需要证明 remote cache 真正在 serving hits，而不是只完成预热
- 某个本地 warning 很吵但不会阻塞，需要与 CI 门禁健康单独跟踪

如果仓库既没有 branch protection，也没有 helper-script policy，更没有构建型共享边界，就不一定需要完整引入这套模式；但一旦这些约束存在，把它们直接写进工作流通常比依赖口头约定更可靠。

## Examples

这次 rollout 在仓库里最终由这些具体部分协同实现：

- `.github/workflows/pr-quality.yml` 是这次 rollout 的主表面：它保留稳定 job 名，把 `pnpm/action-setup` 升级到 `v5`、把 `actions/github-script` 升级到 `v8`，并继续维持仅同仓库可用的 cache env 接线。
- `.prettierignore` 排除了 tool-managed 目录，让 format gate 只覆盖 repo-owned surfaces。
- `apps/api/package.json` 移除了失效的 `NODE_OPTIONS=--no-webstorage` 用法，使 API tests 能兼容 GitHub Actions Node `24.14.1`。
- `.github/scripts/pr-quality-scope.mjs`、`.github/scripts/pr-quality-scope.test.mjs` 与 `.github/scripts/pr-quality-command-plan.mjs` 作为既有 helper-script 设计，继续提供可信 scope 判定、trust boundary 与命令规划上下文。
- `README.md` 与 `README.zh-Hans.md` 继续作为 trusted same-repo cache 行为的维护者说明。

这类模式的验收至少应覆盖：

- scope 与 command planning 的 helper-script tests
- workflow 语法校验
- docs-only、app-local、shared/root 三类改动的分类检查
- 本地 `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test` 以及 package-specific test runs
- 能区分 cache enablement 与 cache hits 的远端证据，例如 run `24308312552` 的 attempt 2 与 attempt 3

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
