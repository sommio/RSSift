---
title: fix: 稳定 PR 质量 CI 首次 rollout 后的行为
type: fix
status: completed
date: 2026-04-12
origin:
  - docs/en/plans/2026-04-12-001-feat-github-pr-quality-ci-plan.md
  - docs/zh-Hans/plans/2026-04-12-001-feat-github-pr-quality-ci-plan.md
---

# fix: 稳定 PR 质量 CI 首次 rollout 后的行为

## Overview

本计划用于稳定刚上线的 PR 质量工作流，因为第一次真实 smoke PR 暴露了三个彼此独立的问题：format gate 当前检查的是整个仓库，而不是预期的 repo-owned 范围；API 测试脚本依赖一种会被 GitHub Actions Node 24 运行时拒绝的 Node flag 用法；workflow 还会输出 `pnpm/action-setup@v4` 的 Node 20 弃用告警。

这次工作保持严格收口：目标是让现有 PR quality CI 能够对合法的代码变更稳定通过，而不是削弱 branch protection 语义、改变 trust model，或顺手把范围扩展成更大的 CI 重构。

## Problem Frame

当前分支被刻意用来触发新加的 PR quality workflow，以验证“非 docs-only 的 PR”是否能真正跑通远端门禁。这次 smoke run 没有得到干净通过，而是暴露了明确可修的失败点：

- `format` 失败，因为 `package.json` 仍把 `format:check` 定义成 `prettier --check .`，这会扫描整个仓库，包括 `.agents/` 和其他超出当前 repo-owned 质量边界的既有文件。
- `test` 失败，因为 `apps/api/package.json` 通过 `NODE_OPTIONS` 传入了 `--no-webstorage`，而 GitHub Actions 的 Node `24.14.1` 运行时拒绝这种用法。
- `e2e` 失败只是因为前置 required jobs 已经失败。
- 此外 workflow 还会输出 `pnpm/action-setup@v4` 的 Node 20 弃用告警；它不是本次失败的直接原因，但已经是很近的维护风险。

本计划的目标，是在保留 docs-only 显式 no-op 行为、保留共享/根目录改动保守 full-run 行为的前提下，让现有 PR quality workflow 对有效代码 PR 变得可信且可绿。

## Requirements Trace

- R1. 恢复当前 `pr-quality` workflow 对非 docs-only PR 的可通过路径。
- R2. 保留适合 branch protection 的稳定 job 名称与显式 no-op 语义。
- R3. 防止 `.agents/` 这类外部或工具管理内容继续制造 format 假失败。
- R4. 保持 repo-owned 的源码、配置和持久文档仍处于 format gate 管控之内。
- R5. 去掉当前 API 测试执行路径中的 Node 24 不兼容点，但不能削弱实际测试覆盖。
- R6. 保持 `e2e` 作为依赖上游结果的终局门禁；当根因在上游时，不把它当作首要修复目标。
- R7. 如果存在低风险兼容升级路径，则在同一轮稳定化中顺手处理 `pnpm/action-setup` 的运行时告警。
- R8. 保持所有改动小、可审计，并继续符合当前 Turborepo / root orchestration 的所有权边界。

## Scope Boundaries

- 不重设计 PR scope classifier，也不重做 required jobs 拓扑，除非修复本身不可避免地要求这样做。
- 不重新打开 `docs/en/plans/2026-04-12-001-feat-github-pr-quality-ci-plan.md` 中已经定下的 rollout 级决策。
- 除非为了消除假失败必须这样做，否则不扩张 docs-only 优化，也不新增更多跳过启发式。
- 不新增依赖。
- 不把这次修复扩张成一次仓库级的大规模格式化清理；只有当最终方案明确要求把仍处于 gate 范围内的 repo-owned 文件拉回基线时，才做有针对性的格式归一。

## Planning Context

### Relevant Code and Paths

- 仓库地址: `https://github.com/sommio/RSSift`
- 用于 smoke 测试的 PR: `https://github.com/sommio/RSSift/pull/3`
- 已确认失败的 run: `https://github.com/sommio/RSSift/actions/runs/24306566404`
- Workflow: `.github/workflows/pr-quality.yml`
- 命令规划脚本: `.github/scripts/pr-quality-command-plan.mjs`
- 根脚本入口: `package.json`
- API 测试脚本: `apps/api/package.json`
- 共享 Jest 配置: `packages/jest-config/src/nest.ts`
- 既有 rollout 计划: `docs/en/plans/2026-04-12-001-feat-github-pr-quality-ci-plan.md`
- 既有 workflow 经验文档: `docs/en/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`
- 既有 monorepo workflow 经验文档: `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`

### Current Failure Shape

- 对实现 agent 而言，本地 GitHub 访问上下文已经具备：仓库根目录 `.env` 现已包含 `GH_TOKEN` 与 `GITHUB_TOKEN`，可供本地工具/API 读取验证使用。计划默认这些 secret 只保留在本地、继续被 gitignore 忽略，绝不能写入持久文档、已提交文件、PR 文案或 workflow YAML。
- 当前 smoke 测试用的 pull request 是 PR `#3`（`chore/ci-smoke-pr-20260412` -> `develop`），其失败的 `pr-quality` run 已经通过本地 agent 工具确认。
- `format` 当前会规划执行 `pnpm format:check`，而它最终落到的是 `prettier --check .`。
- 当前 format 的失败集合并不只包含 `.agents/`；即使忽略 `.agents/`，repo-owned 文件也仍会失败，除非把它们重新格式化或有意排除。
- `test` 当前会规划执行 `pnpm test` 或 `pnpm test:root && turbo run test --affected`，两条路径最终都会通过 `NODE_OPTIONS=--no-webstorage jest ...` 执行 `apps/api` 测试。
- 当前 `apps/api` 测试在去掉这段 `NODE_OPTIONS` 用法后，本地仍然可以通过，这说明不兼容点更像是“调用方式”而不是“测试逻辑本身”。

### Institutional Learnings

- `docs/en/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md` 强调：workflow 应当保持显式、具备 trust awareness、且在不确定时偏保守，而不是依赖 reviewer 的脑补。
- `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md` 强调：root-owned workflow 表面应保持薄且可审计。
- `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md` 强调：持久文档必须保持中英文同步。

## Key Technical Decisions

- 优先通过“缩小假失败表面”来修 workflow，而不是通过弱化 required jobs 或把失败改成 warning 来过关。
- 对 Prettier 来说，把 `.agents/` 视为非 repo-owned 的外部/工具管理内容，并显式排除，而不是继续要求贡献者维持它的格式一致。
- 继续让 repo-owned 的代码、配置、锁文件和持久文档处于 format gate 管控范围内；若这些仍然失败，优先做基线归一，而不是默认继续扩大 ignore。
- 除非 implementation 发现一个 Node 24 兼容且语义等价的替代方案，否则直接移除 `apps/api` 测试入口中的 `NODE_OPTIONS=--no-webstorage` 用法。
- 只要升级路径低风险，就把 `pnpm/action-setup@v4` 的 Node 20 弃用告警纳入这次稳定化处理；但不因此改写 workflow 的整体结构。
- 把 GitHub 远端验证视为 implementation 完成条件的一部分，而不是人工补做的后续步骤。实现 agent 应使用本地 `.env` 的 token 上下文检查 PR `#3`，在权限允许时主动重跑相关 workflow/jobs，并确认修复后的分支是否把远端 `pr-quality` 检查带绿。

## Open Questions

### Resolved During Planning

- format 是否应该忽略 `.agents/`？应该。用户已明确指出它是外部噪音，当前失败面也证明它不应属于 branch-protection 格式门禁。
- `.agents/` 是否是 format 唯一的问题？不是。repo-owned 文件本身也仍然有格式问题，必须直接处理。
- 首先要修的是 `e2e` 吗？不是。它是 `format` 与 `test` 上游失败后的级联结果。
- `pnpm/action-setup` 告警是不是当前红灯的主因？不是。它是独立的维护项。

### Deferred to Implementation

- format 修复最终是通过 `.prettierignore`、更窄的根脚本，还是两者结合来表达，可以在 implementation 阶段根据结果最终落定。
- 移除 `NODE_OPTIONS=--no-webstorage` 后是否还会残留 API 测试运行时 warning，应在验证阶段根据实际结果决定是否需要继续处理。
- `pnpm/action-setup@v4` 的具体替代版本，应在 implementation 时确认可用的 Node 24 兼容 release 后再决定。
- 当前 `.env` 中可用 token 是否同时具备 `Actions: Write` 以支持远端 rerun，应在 implementation 阶段确认；如果没有重跑权限，agent 仍应使用该 token 做只读回读验证，并把剩余限制明确记录出来。

## Implementation Units

- [x] **Unit 1: 让 format gate 对齐 repo-owned 范围**

**Goal:** 让 `.agents/` 和其他非仓库自有内容不再触发 PR quality format 失败，同时保留对 repo-owned 文件的格式约束。

**Requirements:** R1, R2, R3, R4, R8

**Dependencies:** None

**Files:**

- Modify: `.prettierignore`（若不存在则创建）
- Modify: `package.json`（如果最终方案需要把根 format 命令收窄）
- Test: `package.json`

**Approach:**

- 为 `.agents/` 以及其他确认属于工具管理、但不应参与仓库格式门禁的内容增加显式 ignore。
- 重新运行 `pnpm format:check`，把剩余失败点收敛到 repo-owned 文件集合。
- 对仍处于 gate 范围内的 repo-owned 文件做格式归一，而不是继续默认用更多 ignore 隐藏它们；除非某路径被明确证明是外部/生成物。
- 保持最终行为可以从 `package.json` 与 `.prettierignore` 直接审计出来。

**Patterns to follow:**

- `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`
- `docs/zh-Hans/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`

**Test scenarios:**

- Happy path — `.agents/**` 不再出现在 `pnpm format:check` 失败列表中。
- Happy path — repo-owned 的源码/配置/文档仍然会参与 format 检查。
- Edge case — 如果还有其他外部/工具管理路径，也会被显式忽略，而不是靠隐式行为碰运气。
- Error path — 真正的 repo-owned 格式问题仍然会让 gate 失败。

**Verification:**

- `pnpm format:check`
- 使用本地 `.env` token 上下文，对 PR `#3` 及其最新 `pr-quality` run 进行 GitHub 侧回读验证

- [x] **Unit 2: 让 API 测试入口兼容 CI Node 24**

**Goal:** 去掉当前 API 测试调用中的 Node 24 不兼容点，让 `test` job 能在 GitHub Actions Node `24.14.1` 上通过。

**Requirements:** R1, R5, R6, R8

**Dependencies:** Unit 1 可并行推进；无硬依赖

**Files:**

- Modify: `apps/api/package.json`
- Review: `packages/jest-config/src/nest.ts`
- Review: `apps/api/test/jest-e2e.json`

**Approach:**

- 先从 `test` 与 `test:e2e` 中移除 `NODE_OPTIONS=--no-webstorage`，然后验证在既有纯 Node 测试环境声明下，Jest 是否仍能稳定运行。
- 只有在移除后出现明确回归时，才引入替代机制。
- 保持修复归属在 `apps/api` 自身，而不是引入根级条件分支或 workflow 特判。

**Patterns to follow:**

- `packages/jest-config/src/nest.ts`
- `.github/workflows/pr-quality.yml`

**Test scenarios:**

- Happy path — `pnpm --filter api test` 在当前本地 Node 环境下，不依赖 `NODE_OPTIONS=--no-webstorage` 也能通过。
- Happy path — `pnpm test` 可以一路跑过 API package，而不会再命中被拒绝的 Node option。
- Edge case — 脚本调整后，API e2e 命令解析仍然正确。
- Error path — 如果移除后暴露出真实环境回归，则替代方案必须显式且兼容 Node 24，而不是把无效的 `NODE_OPTIONS` 用法塞回去。

**Verification:**

- `pnpm --filter api test`
- `pnpm test`
- 使用本地 `.env` token 上下文，对 PR `#3` 及其最新 `pr-quality / test` 结果进行 GitHub 侧回读验证

- [x] **Unit 3: 去掉 workflow 运行时弃用告警**

**Goal:** 去掉 `pnpm/action-setup` 的 Node 20 弃用告警，让 workflow 面对 GitHub Actions 未来 runner 变化时更稳。

**Requirements:** R7, R8

**Dependencies:** None

**Files:**

- Modify: `.github/workflows/pr-quality.yml`

**Approach:**

- 先确认 `pnpm/action-setup@v4` 当前可用的兼容替代版本。
- 一次性更新 workflow 中 4 处调用点，保持运行时表面一致。
- 除非新版本强制要求最小语法调整，否则不改 workflow 的其他逻辑。

**Patterns to follow:**

- `.github/workflows/pr-quality.yml`

**Test scenarios:**

- Happy path — action 版本更新后，workflow YAML 依然有效。
- Happy path — `format`、`static`、`test`、`e2e` 四个 job 的 pnpm setup 语义保持一致。
- Error path — 如果暂时找不到兼容升级路径，就把它明确记为后续项，而不是靠猜测切版本。

**Verification:**

- 本地 YAML 结构检查
- 根据 token 权限，在 PR `#3` 上对相关 workflow 路径执行“远端重跑或远端回读”验证

## Sequencing

1. 先修 format 表面，避免 workflow 因无关内容而失败。
2. 再修 API test 入口，使 `test` job 兼容 Node 24。
3. 最后更新 `pnpm/action-setup`，因为它是低风险但并非当前红灯的直接原因。
4. 在再次推送或重跑 CI 之前，先本地验证 `pnpm format:check` 与 `pnpm test`。
5. 使用仓库根目录 `.env` 中的 token 上下文检查 PR `#3`，并在权限允许时由实现 agent 主动重跑失败的远端 workflow/jobs，把 GitHub 侧结果证据纳入完成标准。

## Success Criteria

- 一个非 docs-only 的 PR 能通过 `pr-quality / format`、`pr-quality / static`、`pr-quality / test` 与 `pr-quality / e2e`。
- `.agents/` 不再制造 format 假失败。
- `apps/api` 测试不再依赖无效的 `NODE_OPTIONS` 用法。
- workflow 不再输出当前 `pnpm/action-setup` 的 Node 20 弃用告警；如果暂时做不到，计划中必须明确记录其未解决原因。
