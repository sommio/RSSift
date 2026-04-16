---
date: 2026-04-16
topic: test-boundaries-and-eslint-guardrails
---

# 测试边界与 ESLint 护栏

## Problem Frame

当前仓库在应用包内同时存在两种测试组织方式：一类是放在 `apps/api/src/**` 中、与 feature code 同目录的模块内单元测试；另一类是集中在 `apps/api/test` 下的应用级端到端测试。这个分层本身是健康的，但 `test` 这个目录名会暗示“这里承载了 API 的全部测试”，而这已经不符合事实，也容易误导后续贡献者把新测试放错位置。

与此同时，仓库希望补一层轻量的架构护栏，让 `apps/api` 与 `apps/web` 的可维护性问题能更早暴露，但又不把 lint 变成和框架对着干的工具。本次目标不是追求任意形式上的“代码洁癖”，而是让 package-local 的测试边界更清晰，并通过宽松的 ESLint 行数 / 复杂度规则，尽早拦住明显失控的文件和函数。

## Requirements

**测试边界语义**

- R1. `apps/api` 中的应用级 e2e 测试必须放在一个目录名能明确表达 e2e 语义的位置，而不是继续使用会暗示“承载全部测试”的命名。
- R2. `apps/api/src/**` 中的模块内单元测试和窄范围集成测试应继续与被验证的 feature code colocate。
- R3. 仓库应继续保留“package 内模块测试”与“应用装配层 / HTTP / 数据库驱动 e2e 测试”之间的清晰分层。
- R4. 仅为应用级 e2e 服务的测试辅助代码，应继续与 e2e suite 相邻，而不是过早抽进共享运行时 package。

**Lint 护栏**

- R5. 仓库应在 `apps/api` 和 `apps/web` 中加入宽松的 ESLint 可维护性护栏，用于捕获过大的文件、过大的函数，或明显过度复杂的控制流。
- R6. 这批护栏不能对所有应用代码使用同一套阈值。前端和后端的限制应分别调节，因为 React / Next 组件文件与 Nest service / controller 的天然形态不同。
- R7. 前端限制至少应区分“逻辑型 TypeScript 文件”和“JSX / TSX 组件文件”，必要时还应对 page、layout 这类框架入口文件给予额外宽松空间。
- R8. 测试文件不应和生产源码使用同一套大小限制；它们需要更宽松的阈值或定向豁免。
- R9. 第一版应优先选择少量、低歧义的 ESLint 规则，而不是一次性上大量规则，导致忙于消除噪音或为了过规则而机械切函数。

**执行方式**

- R10. 这批可维护性护栏应通过现有 ESLint 入口执行，而不是额外引入一条自定义检查链路。
- R11. CI 应继续把 ESLint 视为这些规则的必需质量门，而不是再创建一条平行的 enforcement path。

## Success Criteria

- 贡献者看到 `apps/api/e2e` 时，能立刻理解它承载的是 API 应用级 e2e，而不是全部 API 测试。
- 仓库继续保留 `apps/api/src/**` 中的 colocated 模块测试，同时让应用级 e2e 层更容易发现、也更不容易被误用。
- `pnpm lint` 能在 `apps/api` 和 `apps/web` 中暴露明显过大或过复杂的文件 / 函数，而不会制造大面积、低价值的清理噪音。
- 前端和后端开发者面对的是对自身文件形态相对公平的规则，而不是一套最低公分母阈值。

## Scope Boundaries

- 本次决策覆盖应用级 e2e 目录命名与放置语义，以及第一轮 ESLint 可维护性护栏。
- 本次决策不重构 monorepo 的 package graph，也不把 app-specific 测试搬进 `packages/`。
- 本次决策不试图在第一版里把完整架构边界全部编码成 ESLint 规则。
- 只要 planning 已经获得“相对严格度与豁免策略”的方向，本次 brainstorm 不要求立刻拍板所有精确数值阈值。

## Key Decisions

- 将有误导性的 `apps/api/test` 重命名为 `apps/api/e2e`，让目录名称表达真实范围，而不是错误地宣称自己承载全部测试。
- 保留 feature folder 内的 colocated 模块测试。当前问题在于应用级测试目录的语义，而不是两层测试并存本身。
- 将行数限制和复杂度限制定义为“可维护性护栏”，而不是架构边界本身的主要表达方式。
- 第一版继续走现有 ESLint 与 CI 流程，因为仓库已经把 lint 当成 required gate。
- 规则阈值应按应用上下文和文件角色拆分，而不是假设 React 组件和 Nest provider 应共享同一套限制。

## Dependencies / Assumptions

- `apps/api/src/**` 里已经存在与 feature-local 行为 colocate 的 `*.spec.ts` 单元测试。
- `apps/api/test/*.e2e-spec.ts` 与 `apps/api/test/test-db.ts` 证明今天已经存在独立的 API 应用级 e2e 层及其专用 helper。
- `apps/web/eslint.config.mjs`、`apps/api/eslint.config.mjs` 与 `packages/eslint-config/*` 已经形成共享 ESLint 所有权，可以承载这批新护栏。
- `package.json`、`apps/api/package.json` 与 `apps/web/package.json` 已经暴露 lint 命令，CI 也已把它们视作 required quality gate。

## Alternatives Considered

- **保持 `apps/api/test` 不动，只依赖文档解释：** 改动成本最低，但误导性的目录名会持续向贡献者灌输错误心智模型。
- **把所有测试都收拢到统一的 app test 树：** 表面上更整齐，但会削弱 feature-local ownership，也让模块测试脱离被验证代码。
- **推荐方向 — 保留双层结构，但重命名应用级 e2e 目录并补轻量 lint 护栏：** 既澄清语义，也不破坏已有合理边界，更避免第一步就过度设计。

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Technical] `apps/api`、`apps/web/**/*.ts`、`apps/web/**/*.tsx` 与测试文件分别应采用哪些 ESLint 规则与精确数值阈值。
- [Affects R7][Technical] `apps/web/app/**` 下哪些 Next.js 入口文件在第一版需要定向豁免或更宽松阈值。
- [Affects R10][Technical] 阈值拆分应完全放在 `packages/eslint-config`，还是部分放在 app-local ESLint config 中。
- [Affects R11][Technical] 如果第一版阈值命中过多既有文件，落地时应一次性严格启用，还是采用分阶段清理策略。

## Next Steps

-> /ce:plan for structured implementation planning
