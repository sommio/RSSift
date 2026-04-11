---
date: 2026-04-11
topic: git-hooks-scheme-a
---

# Git Hooks 方案 A

## 问题背景

当前仓库已经有基于 workspace 的质量检查入口，例如 `package.json` 脚本和 `turbo.json` 任务，但还没有在代码离开开发者机器前通过本地 Git hook 做统一门禁。本次决策的目标是在这个 Turborepo monorepo 中降低低质量提交和推送进入主干的概率，同时保持日常开发流程足够顺畅。

## Requirements

**本地质量门禁**

- R1. 在 commit 创建之前，暂存文件必须只针对本次提交涉及的文件完成格式化与 lint 检查；当这些检查能够安全地自动修复时，更新后的 staged files 应继续保留在本次提交尝试中，否则 commit 必须以清晰的失败信号中止。
- R2. 在 push 被接受之前，workspace 必须基于现有 monorepo 任务模型完成一次仓库级 typecheck 门禁。本次 rollout 必须要么确保所有相关 package 都参与该门禁，要么明确把门禁范围收窄到已声明在范围内的 package。
- R3. 本次选定的 hook 流程不得运行端到端测试。

**与仓库现状对齐**

- R4. hook 工作流必须对齐现有仓库入口，例如 `package.json`、`turbo.json` 和各 package 本地脚本，而不是再引入一套独立任务模型。只有在仍然作为现有工具链薄编排层时，才允许新增 hook 专用辅助入口。
- R5. hook 工作流必须保持 Turborepo 的 package 边界原则：package 内任务仍然是真实来源，根命令只承担编排入口职责。

**开发者体验**

- R6. commit 阶段的检查应聚焦于快速、本地、基于 staged files 的校验，避免频繁提交时产生不必要的阻塞。
- R7. push 阶段的检查可以比 commit 更慢；即使按照当前任务图会连带触发上游 build 前置步骤，其行为也必须对贡献者来说清晰且可预期。

## Success Criteria

- staged files 会在 commit 完成前被格式化并通过 lint；任何无法自动恢复的检查失败都会中止 commit。
- 当属于范围内 package 的 workspace typecheck 门禁失败时，push 会被阻止。
- 本次决策范围内的 Git hook 不会运行 `test:e2e` 或等价的端到端测试套件。
- 选定流程复用现有 repo-relative 入口，而不是创建一条平行的临时代码质量流水线。

## Scope Boundaries

- 本次决策只覆盖代码质量相关的本地 Git hook。
- 本次决策不定义具体工具配置、文件内容或命令语法。
- 本次决策不改变 CI 策略、部署行为或发布流程。
- 本次决策不引入 commit message 规范，也不扩展到当前讨论之外的其他 hook 类型。

## Key Decisions

- 选择方案 A：commit 阶段只做 staged format 与 lint，workspace typecheck 移到 push 阶段执行。
- 有意不把仓库级 typecheck 放进 `pre-commit`，以便在 monorepo 工作流中保持可接受的 commit 延迟。
- 端到端测试继续留在本地 hook 之外，仍通过现有非 hook 流程执行。

## Dependencies / Assumptions

- `package.json` 与 `turbo.json` 中现有的 repo-relative 质量检查入口会继续作为 hook 集成基础。
- 如果当前根脚本无法自然表达 staged-files 行为，可以新增一个薄的 hook 专用编排入口。
- 对于 workspace 脚本仍不完整的 package，可能需要补齐任务覆盖；例如 `packages/ui/package.json` 当前缺少本地 `lint` 和 `typecheck` 脚本。
- 当前 `typecheck` 任务图可能会触发上游 `build` 前置步骤；除非规划阶段显式调整任务图，否则这种行为视为可接受。
- CI 仍会继续承担超出本地 hook 范围的全仓校验职责。

## Outstanding Questions

### Deferred to Planning

- [Affects R1][Technical] 这个仓库最终由哪一种 hook 管理器承载实现。
- [Affects R1][Technical] staged 文件的 format 与 lint 应采用哪种命令映射。
- [Affects R2][Technical] push 阶段应如何调用根 workspace typecheck 入口，同时仍然满足仓库级要求。
- [Affects R2][Technical] 哪些 package 需要在本次 rollout 中补齐到 typecheck 覆盖范围。
- [Affects R4][Technical] package 任务覆盖应在 hook rollout 之前补齐，还是在落地过程中一并规范。

## Next Steps

-> /ce:plan for structured implementation planning
