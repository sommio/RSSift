---
date: 2026-04-24
topic: developer-efficiency-friction
focus: repository-wide tracked-file scan, excluding .agents/skills
---

# Ideation: 后续开发效率摩擦点

## Codebase Context

本轮基于 `git ls-files`，并排除 `.agents/skills/**`。扫描到的 tracked
surface 共 255 个文件：`apps/` 112 个，`docs/` 75 个，`packages/` 28 个，
`.github/` 17 个，另有根目录工具、部署与配置文件。

项目形态：

- Turborepo monorepo，包含 `apps/api`、`apps/web` 与共享 packages。
- `apps/api` 是 NestJS + Prisma + PostgreSQL，负责 feed ingestion、正文抽取、
  LLM 摘要、health check 与 `/articles` 读取 API。
- `apps/web` 是 Next.js App Router，通过 server component 路径按
  `API_BASE_URL` 读取 API，并渲染 article reader。
- `packages/ui`、`packages/eslint-config`、`packages/jest-config`、
  `packages/typescript-config` 提供共享 UI 与工具配置。
- durable docs 采用 `docs/en/` 与 `docs/zh-Hans/` 双语配对维护。

现场信号：

- `apps/web/src/widgets/article-reader/api/articles-api.ts` 手写 web 侧 API
  类型，并通过 `response.json()` 后的类型断言信任后端 payload。
- `apps/api/src/articles/dto/*.ts` 另写后端 DTO class，没有和 web 共源的
  runtime contract 或生成 client。
- `apps/api/e2e/articles.e2e-spec.ts` 通过 key 断言保护 shape，但测试 helper
  仍把 `unknown` response body cast 成 DTO 类型。
- `apps/api/src/feeds/feed-ingestion.service.ts` 494 行，同时负责 OPML 遍历、
  feed HTTP、解析、identity、持久化、富化调度、retry、budget 与日志。
- `apps/api/src/article-summary/article-summary.service.ts` 同时负责内存队列、
  并发、去重、retry timing、持久化状态转换与日志。
- `turbo.json` 用 repo-wide `globalDependencies` 与 `globalEnv` 影响全部任务，
  包括 runtime env 与本地 env 文件。
- `apps/web/playwright.config.ts` 把 API build、migration reset、seed、API
  start、web start 串在一个很长的 inline shell command 里。
- `apps/api/README.md` 与 `apps/web/README.md` 仍描述旧的 public
  `summaryErrorReason` contract，而当前代码已经暴露结构化 `summaryError`。
- solution docs 虽然保持双语配对，但目录已有 `best-practices`、
  `logic-errors`、`ui-bugs`，当前 `AGENTS.md` 的分类规则却更窄。

已有 repo learnings：

- 根 `pnpm typecheck` 应理解为 Turbo workspace 覆盖，不是 root `tsc` 覆盖。
- CI e2e 稳定性依赖每个 suite 只有一个 seed/reset 目标，并保持 build 与
  start 阶段 env 一致。
- Feed ingestion 必须保持 article-content 与 summary 富化复用 canonical
  ingestion pipeline。
- Retryable summary failure 在重试耗尽前不能清掉已有可读 summary。
- Repo-root Compose 是 operator contract；当前 self-hosted 路径保持 HTTP-only。

## Ranked Ideas

### 1. 把 Web/API 读取边界迁到 shared contract 或 tRPC

**Description:** 用 repo-owned contract 替换
`apps/web/src/widgets/article-reader/api/articles-api.ts` 里的手写类型。最强方向
是为 app-internal reads 迁到 tRPC；如果 Nest REST 仍要保留 public surface，则至少
建立 schema-first shared package。两条路都必须移除未校验的
`response.json() as T`，让 payload validation 或类型推导与后端实现共源。

**Rationale:** 这是最高杠杆的未来 DX 问题。当前边界“看起来有类型”，但不是真正
contract-safe：后端 DTO class、web type、e2e shape 断言都可以独立漂移。未来每加
一个 reader 字段或错误态，都要手工同步 API DTO、service mapping、web 类型、UI
测试和 e2e 断言。

**Downsides:** 迁移成本高。tRPC + Nest 需要先明确边界，不应只是随手装包。schema-first
REST client 侵入更低，但解决面也更窄。

**Confidence:** 96%

**Complexity:** High

**Status:** Unexplored

### 2. 让 Turbo cache 输入按任务收窄，而不是全局 env 敏感

**Description:** 调整 `turbo.json`，只让真正消费 runtime env 与本地 env 文件的任务
把它们纳入 hash。保持 workspace task ownership 不变，但把 broad
`globalEnv` / `globalDependencies` 收敛成 build、e2e、API tests、deployment-sensitive
任务各自的 `env` 与 `inputs`。

**Rationale:** 当前所有任务都继承 `API_BASE_URL`、`DATABASE_URL`、`LLM_*`、
`TEST_DATABASE_URL` 和 `**/.env.*local`。这很安全，但成本高：本地 env 改动会让
lint/typecheck 这类不需要 runtime 值的路径也 cache miss，影响迭代速度，也让 cache
行为难解释。

**Downsides:** 需要逐任务审计。收窄过度会让 e2e 或 build 出现陈旧 cache hit。落地前
需要 `turbo --summarize` 或测试证据。

**Confidence:** 90%

**Complexity:** Medium

**Status:** Unexplored

### 3. 建立一等公民的本地 DB 与 e2e harness

**Description:** 增加一个面向开发者的命令或 helper：负责启动/确认 PostgreSQL、应用
正确 migrations、seed 正确 target，并运行 API 或 web e2e。每个 suite 保持一个 reset
owner，并显式选择 database target。

**Rationale:** repo 已经沉淀过数据库 target 漂移的教训。当前测试仍依赖真实本地
PostgreSQL，多个 spec 里重复 env 设置，`apps/web/playwright.config.ts` 还把 setup
藏在 inline shell command 里。未来贡献者很容易先卡在连接、迁移和 seed 不一致，而
不是产品代码本身。

**Downsides:** 不能再次把 Prisma reset 和自定义 reset helper 叠在一起。容器化路径若
做成默认项，可能增加运行成本；更适合先做 opt-in。

**Confidence:** 88%

**Complexity:** Medium

**Status:** Unexplored

### 4. 把 Feed ingestion 拆成显式 pipeline stages

**Description:** 将 `FeedIngestionService` 拆成更小的 stage-owned units：OPML
subscription loading、feed fetching、feed parsing normalization、article identity、
persistence diffing、enrichment dispatch、run logging。保留当前 canonical ingestion
path 与测试，只让边界变清晰。

**Rationale:** `feed-ingestion.service.ts` 是未来功能热点。它同时协调 time budget、retry、
解析、DB 写入、正文抽取和 summary refresh。任何 freshness、repair、identity 或
enrichment 改动都会触碰同一个大 mutation path，review 成本和回归风险都会增加。

**Downsides:** 这条 refactor 风险不低，因为文件里包含多个已修过的历史 bug 约束。应先
补 characterization tests，再分阶段迁移，不能一口气重写。

**Confidence:** 87%

**Complexity:** High

**Status:** Unexplored

### 5. 给 summary generation 一个持久化 job 边界

**Description:** 将 `ArticleSummaryService` 从内存队列逐步迁向小型 durable job model，
或至少先抽出 job-runner interface 与明确 lifecycle metrics。第一步仍可保持单进程，但
不要让 retry 与 dedupe 语义继续散落在 feature service 内部。

**Rationale:** 当前 summary 调度通过 service 内部数组、`Set` 和 `setTimeout` 完成。这对
v0.1 很务实，但会限制 restart recovery、可观测性、retry 检查与未来多进程形态。repo
已经明确 Compose 当前是 single-process；这也是一个已知上限。

**Downsides:** 现在直接引入完整 queue system 可能过度。第一步更可能是最小 durable
state table 或 adapter seam，而不是默认上 BullMQ。

**Confidence:** 84%

**Complexity:** High

**Status:** Unexplored

### 6. 为 durable docs 增加 contract drift gate

**Description:** 增加一个小的 repo-owned 检查，用来发现 durable docs 里的旧 contract
术语。初始规则可以检查当前 app README 中的 `summaryErrorReason`，当 DTO 或 API
已暴露 `summaryError` 时提示漂移；同时检查双语 counterpart 与已删除 endpoint 引用。

**Rationale:** 当前 `apps/api/README.md` 和 `apps/web/README.md` 仍在传达旧的 summary
error surface。这会误导后续实现与 review。repo 已经把 docs 视作双语 durable artifacts，
所以一个小型 drift check 符合现有工作流。

**Downsides:** keyword check 容易误报历史 plans 和 brainstorms。第一版应该只覆盖当前
README/operator docs，而不是扫描所有归档规划材料。

**Confidence:** 91%

**Complexity:** Low

**Status:** Unexplored

### 7. 集中 env schema、examples 与 docs 生成/校验

**Description:** 为每个 app/deployment surface 定义单一 runtime env schema，并用它生成或
校验 `.env.example`、README 配置表、Compose env coverage，以及 `turbo.json` env 引用。

**Rationale:** Env 变量分散在 `apps/api/src/config`、app-local `.env.example`、root
`.env.example`、Compose、Playwright、CI 和 docs 中。API validation 目前是手写函数，
而项目已经依赖 `zod`。未来 env 改动如果继续靠人工同步，很容易漏掉某个 surface。

**Downsides:** 过度生成 README 会制造噪音。第一版应先做 validation 和 consistency
check，再考虑完整 docs generation。

**Confidence:** 86%

**Complexity:** Medium

**Status:** Unexplored

### 8. 从 inline shell string 中抽出 Playwright/e2e 编排

**Description:** 把 `apps/web/playwright.config.ts` 里的长 `webServer.command` 移到 package
script 或 checked helper script。保留现有 env contract，但让 build、reset、seed、API
start、web start 各阶段可读、可复用、可单独调试。

**Rationale:** 当前 inline command 难阅读、难引用、难复用，也难安全修改。它还隐藏了
之前 CI e2e 失败所依赖的 database setup 决策。用带测试的脚本命名各阶段，可以降低
后续 e2e 改动成本。

**Downsides:** 如果 helper 只是包一层 shell，就会变成无意义间接层。价值来自阶段命名和
env propagation 测试。

**Confidence:** 83%

**Complexity:** Low

**Status:** Unexplored

### 9. 统一 solution-doc taxonomy 或更新治理规则

**Description:** 明确 solution categories 是否故意比当前 `AGENTS.md` 更宽。要么更新
`AGENTS.md` 纳入已有的 `best-practices`、`logic-errors`、`ui-bugs`，要么把目录迁回或
alias 到文档化分类。必须保持双语 parity。

**Rationale:** 实际 docs tree 双语配对健康，但 category policy 与现有目录已经不一致。
未来 `ce:compound` 或 docs cleanup 要放置 learning 时，会先遇到路由歧义。

**Downsides:** 技术风险低，但 taxonomy churn 会制造 review 噪音。最好先做小范围 policy
clarification，再决定是否移动文件。

**Confidence:** 79%

**Complexity:** Low

**Status:** Unexplored

### 10. 用 validated adapters 包住第三方 feed parsing

**Description:** 给 `feedsmith` OPML/feed item 访问加 adapter，输出已校验的 internal
shapes。用 schema 或 typed normalization layer，把 `Record<string, unknown>` cast 限制在
一个外部输入边界内。

**Rationale:** 当前 `feed-ingestion.parsers.ts` 和 OPML traversal 有多处 cast。这作为外部
输入边界可以接受，但未来增加 feed format 支持时，如果后续 ingestion 能消费稳定 internal
shape，维护成本会低很多。

**Downsides:** 不应变成重写 feed parser。目标是 containment，不是替换 `feedsmith`。

**Confidence:** 78%

**Complexity:** Medium

**Status:** Unexplored

### 11. 让 PR quality scope 支持 packages 与 shared config 的安全 affected 路径

**Description:** 扩展 `.github/scripts/pr-quality-scope.mjs`，当 dependency graph 能证明覆盖
关系时，让 package-only 或 shared-config-only 改动也走安全 affected path。root、workflow、
lockfile、unknown changes 仍保守回退 full run。

**Rationale:** 当前 classifier 只把 `apps/*` 识别为 app-local 快路径。v0.1 时这很安全，但
repo 已经有 UI、Jest、ESLint、TypeScript config packages。随着 packages 变多，所有
package 改动都 full-run 会越来越慢。

**Downsides:** 漏检比慢 CI 更糟。需要补 package dependents 测试，并在影响不明确时默认
full run。

**Confidence:** 76%

**Complexity:** Medium

**Status:** Unexplored

### 12. 在 monorepo 继续增长前补显式 package-boundary 检查

**Description:** 为跨 package import 和 generated-source import 增加轻量 boundary guard。
可以用 Turborepo boundaries、ESLint import rules 或 repo-owned script，但要编码当前
`apps/` 与 `packages/` 的 ownership 规则。

**Rationale:** 现在 monorepo 还小，边界主要靠约定维持。等共享代码继续增加后，这种方式
会变脆。现在把边界写进工具里，可以避免未来代码直接跨 app internals 或在 `apps/api`
之外依赖 generated Prisma output。

**Downsides:** 边界工具如果铺太宽会很吵。第一版可先 report-only 或只检查高信号 forbidden
patterns。

**Confidence:** 73%

**Complexity:** Medium

**Status:** Unexplored

## Rejection Summary

| #   | Idea                                           | Reason Rejected                                                      |
| --- | ---------------------------------------------- | -------------------------------------------------------------------- |
| 1   | 只做 OpenAPI client 生成                       | 对这个 internal monorepo seam 来说，弱于 shared contract/tRPC 方案。 |
| 2   | 改成 microservices                             | 成本过高，也违背当前单进程产品形态。                                 |
| 3   | 重新开放 public article-content retry endpoint | 与已确立的 public read-only surface 冲突。                           |
| 4   | 为 FSD purity 新增 `apps/web/src/pages`        | 与当前 Next.js App Router 规则冲突。                                 |
| 5   | 增加 npm publishing workflow                   | 当前产品 release 模型下不是开发效率阻塞点。                          |
| 6   | 立刻给所有 job 做分布式锁                      | 更适合作为 durable-job 后续变体，不应作为首批 survivor。             |
| 7   | 用 raw SQL 替换 Prisma                         | 不符合当前痛点；Prisma 是 repo 真实持久化契约。                      |
| 8   | 把 Compose 移进某个 app package                | 违背已文档化的 repo-root operator contract。                         |
| 9   | 只清理英文 docs                                | 违反 durable docs 双语政策。                                         |
| 10  | 全量替换 feed parser                           | 范围过大；validated adapters 已能解决当前观察到的问题。              |
| 11  | Reader 视觉重设计                              | 偏产品体验，不是本轮主要的后续开发效率问题。                         |
| 12  | 分析 GitHub issues                             | 本轮要求基于 tracked repo 内容，不是 issue tracker。                 |
| 13  | 把所有检查都塞进 commit hooks                  | 重复现有 Husky/lint-staged 流程，并会拖慢本地 commit。               |
| 14  | 硬删提到旧 contract 的历史 plans               | 历史 docs 应保留归档语义；drift gate 应先覆盖当前 docs。             |

## Session Log

- 2026-04-24: 初始 ideation，基于 tracked-file scan。围绕 contract safety、
  task graph、test harness、pipeline structure、docs drift 与 monorepo boundaries
  生成 26 个候选，保留 12 个，拒绝 14 个。
