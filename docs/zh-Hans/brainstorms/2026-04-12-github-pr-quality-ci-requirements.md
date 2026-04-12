---
date: 2026-04-12
topic: github-pr-quality-ci
---

# GitHub PR 质量 CI

## Problem Frame

当前仓库已经通过 Husky、staged-file lint 和 workspace scripts 具备本地质量门禁，但 `.github/workflows/` 下仍然没有任何已提交的 GitHub Actions 工作流。这意味着 pull request 在合并前还没有远端强制质量检查，即便仓库本身已经暴露了 format、lint、单元/集成测试与端到端测试等相关入口。

用户的目标并不是做一整套宽泛的 CI/CD 体系。本次目标是只服务 PR 的质量门禁：既要足够严格，能拦住坏改动；又要复用现有 Turborepo 任务图；还要接入 Vercel Remote Cache，并对有限的 GitHub Actions 月度分钟预算保持敏感。

## Requirements

**触发方式与范围**

- R1. 这套质量工作流必须只在 pull request 上运行；本次范围内不得引入 commit 阶段或通用 `push` 阶段的云端 CI。
- R2. 这套工作流只覆盖代码质量；不包含部署、Docker 镜像构建、发布自动化或其他交付链路。
- R3. 工作流必须复用现有 repo-level 与 package-level 质量入口，而不是再发明一套平行任务模型。

**必需质量门禁**

- R4. 所有落在范围内、会影响代码的 PR，在合并前都必须经过 format、lint、test 与 test:e2e 检查。
- R5. 由于当前仓库已经暴露了 workspace `typecheck` 门禁，PR 质量 CI 应把 typecheck 作为额外的必需信号纳入，而不是只留给本地 hook。
- R6. PR 界面必须让人一眼看出哪个门禁失败；format、lint/typecheck、test、e2e 的结果应清晰到可以直接作为 branch protection checks 使用。
- R7. CI 设计必须保留当前 `lint`、`typecheck` 等任务背后的上游 `build` 前置步骤，只要这些 build 是为了产出 `d.ts` 并验证 package 之间的类型边界；任何省钱优化都不能削弱这层边界检查。

**成本与运行效率**

- R8. 工作流必须通过取消同一个 PR 上已经过期的运行、减少跨 job 或跨 workflow 的重复开销，来尽量节省分钟数。
- R9. 只要不牺牲正确性，turbo 管理的任务应优先使用 Turborepo 原生的增量执行方式，尤其是对只影响 monorepo 一部分的 PR diff。
- R10. 只要凭据可用，GitHub Actions 中必须使用 Vercel Remote Cache 来加速可缓存的任务。
- R11. 必需检查不能依赖顶层 workflow path filters，因为这类过滤可能让 required checks 长时间停留在 pending；任何省钱的跳过逻辑都必须仍然把 PR checks 明确地收敛为成功或失败。
- R12. 如果要用 `no-op success` 省分钟，第一版必须保持这套逻辑足够粗、足够保守、且易于审计；应先从文档-only 或明显非代码 PR 这类显而易见的场景开始，而不是一上来做细粒度依赖推断。

**安全与信任边界**

- R13. 这套工作流必须对不受信任的 PR 执行保持安全；不能为了让 remote cache 生效，就采用会把缓存凭据暴露给 fork PR 代码的设计。
- R14. 当缓存凭据不可用时，工作流应继续执行检查，只是退化为不走 remote cache，而不是悄悄削弱质量门禁。

## Success Criteria

- 任何修改代码的 pull request，在 format、lint、typecheck、test 与 e2e 检查全部通过之前都不能合并。
- 仓库在 `.github/workflows/` 下新增一套已提交的 GitHub Actions 质量工作流，并且其职责明确限定为 PR 质量门禁。
- 同仓库或受信任 PR 可以命中 Vercel Remote Cache，使 rerun 的成本明显低于完全冷启动运行。
- 过期的 PR 运行会自动取消，而不是继续消耗分钟直到结束。
- 如果启用了 no-op 优化，明显的非代码 PR 可以显式短路掉昂贵步骤，但不会让 branch protection checks 卡在 pending。
- 跳过行为本身必须足够简单，让 reviewer 能看懂为什么某个 job 跑了，或者为什么没有跑。

## Scope Boundaries

- 本次决策只覆盖 pull request 的 GitHub Actions 质量检查。
- 本次决策不改变 `.husky/` 中已有的本地 Git hooks。
- 本次决策不重构 monorepo 布局、package 边界或发布流程。
- 除非后续 planning 证明某个质量门禁离不开它，否则本次决策不要求引入完整的全仓 build job。
- 本次决策不把 `pull_request_target` 作为执行不受信任 PR 代码的默认模型。

## Key Decisions

- 默认采用基于 `pull_request` 事件的 PR-only GitHub Actions workflow。这与用户的预算约束一致，也避免为单独的 push workflows 付费。
- 把这次工作定义为“成本敏感的质量门禁”，而不是笼统扩张 CI。真正的问题不是把所有本地命令机械照搬上云，而是怎样让 PR 必过检查既严格又便宜。
- 相比拆成许多互不相关的 workflows，更推荐使用一个 workflow：前面接一个轻量的 setup / change-detection 阶段，后面接多个有名字的质量 jobs。这样既保留 branch protection 的可读性，又减少重复编排开销。
- 保留当前 `lint`、`typecheck` 背后的 `build` 前置步骤，只要这些步骤是为了产出 `d.ts` 并验证跨 package 的类型边界。这里的成本是有意承担的，不是偶然浪费。
- `format`、`lint`、`typecheck`、`test`、`test:e2e` 全部保留在范围内。`no-op success` 是可选的第二阶段省钱优化，而不是第一版必须自带的能力。
- 如果要引入 `no-op success`，先从文档-only 或明显非代码 PR 这种粗粒度、低风险规则开始；不要一开始就在 monorepo 上做细粒度依赖推断。
- 在 GitHub Actions 能安全提供 `TURBO_TOKEN` 与 `TURBO_TEAM` 时使用 Vercel Remote Cache，但不要为了 fork 场景强行改成暴露 secrets 的执行模型。必要时允许 fork PR 走 uncached 路径。
- 对 required checks 来说，优先使用 workflow 内部 change detection，而不是顶层 `paths` / `paths-ignore` 过滤。省钱逻辑应该发生在 workflow 内部，这样检查结果才能稳定落地。

## Dependencies / Assumptions

- `package.json` 已经暴露了 `format:check`、`lint`、`typecheck`、`test` 与 `test:e2e` 入口，可以直接作为 CI-facing 质量门禁。
- `turbo.json` 已经定义了 `lint`、`typecheck`、`test` 与 `test:e2e` 的 turbo 任务，因此在 planning 阶段把 `--affected` 作为优化方向是合理的。
- `apps/web/playwright.config.ts` 已经会在 Playwright e2e 期间拉起 API 和 web 服务，所以浏览器 e2e 不是未来占位，而是现有真实门禁。
- `apps/api/test/jest-e2e.json` 证明 API e2e 与浏览器套件是分开的、已经存在的检查层。
- 当前 `turbo.json` 让 `lint` 与 `typecheck` 依赖上游 `build` 任务，而且这是有意为之，因为上游 build 会产出用于验证 package 类型边界的 `d.ts` 制品。
- GitHub Actions 默认不会把 secrets 提供给 fork pull requests，因此 remote cache 对所有 PR 都生效这件事只能视为条件成立时的优化，而不是默认保证。

## Alternatives Considered

- **单一大 job：** YAML 最简单、编排复杂度最低，但失败定位最弱；只要某一段抖动或失败，rerun 浪费也最大。
- **很多独立 workflows：** 每类检查边界最清晰，但会重复 setup/install 开销，通常也更烧分钟。
- **推荐方向 — 单个 PR workflow + 分阶段 jobs + 内部 change detection：** 既保留 required checks 的清晰度，也给后续 planning 留出并发、缓存、affected-only 优化空间。

## Outstanding Questions

### Deferred to Planning

- [Affects R9][Technical] 哪些 jobs 应该跑 full-repo，哪些 jobs 可以安全使用 `turbo run ... --affected` 而不产生漏报，同时仍保留用于类型边界校验的上游 `build` 前置步骤。
- [Affects R10][Needs research] Vercel Remote Cache 的 secret 处理要怎样设计，才能让同仓库 PR 用上缓存、fork PR 又能安全退化。
- [Affects R12][Technical] 第一版是否应该完全不启用 `no-op success`，还是只对文档-only 与明显非代码 PR 开启。
- [Affects R12][Technical] 如果启用粗粒度 no-op 优化，哪些文件分组应被视为全局高风险改动，只要碰到就必须正常执行、不能跳过。
- [Affects R6][Technical] branch protection 最终应要求一个总 workflow 结果、单独 job 名称，还是两者都要求。
- [Affects R14][Technical] e2e 在实现时应始终作为一个独立终局 job，还是按 app surface 再进一步拆分。

## Next Steps

-> /ce:plan for structured implementation planning
