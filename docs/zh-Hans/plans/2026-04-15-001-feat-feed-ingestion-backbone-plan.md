---
title: feat: 实现 v0.1 第二切片的 feed 入库主干
type: feat
status: completed
date: 2026-04-15
deepened: 2026-04-15
origin:
  - docs/en/brainstorms/2026-04-15-v0-1-slice-2-feed-ingestion-requirements.md
  - docs/zh-Hans/brainstorms/2026-04-15-v0-1-slice-2-feed-ingestion-requirements.md
---

# feat: 实现 v0.1 第二切片的 feed 入库主干

## Overview

这份计划要把 `apps/api` 当前基于 fixture 的读路径，替换为真正的启动期 feed 入库主干，同时保持对外 `/articles` 合同继续纤薄且稳定。这个切片仍然刻意收窄：读取固定本地 `feeds.opml`，在启动时抓取 feed，通过 Prisma 把 `Feed` 与 `Article` 落到 PostgreSQL，再把文章读接口彻底切到持久化数据，并把新的本地工作流同步进仓库的双语文档。

用户还额外给了几条会直接塑造计划的约束：

- 本地 PostgreSQL 校验与操作者文档必须使用 `psql-18`，不能写成泛化的 `psql`。
- 标准开发库与测试库已经预建好，计划必须把它们当作既定本地前置条件，而不是新增工作项：
  - `DATABASE_URL="postgresql://rssift:rssift@127.0.0.1:5432/rssift"`
  - `TEST_DATABASE_URL="postgresql://rssift:rssift@127.0.0.1:5432/rssift_test"`
- app 运行时环境变量的归属要收回到各自 app，而不是继续沿用 root-only 习惯。因此这份计划默认会有提交进仓库的 `*.env.example`，以及在实现期间创建的本地 app env 文件。
- 新包必须用 `pnpm` 安装到真正拥有它的 workspace，并尽量选择当时“最新且兼容的稳定版”；如果实现时出现真实依赖冲突，就必须停下来显式处理，而不是直接强行 override。
- 启动教程应同步刷新 `README.md` 与 `README.zh-Hans.md`，如果 app 级 README 的本地流程也变了，就一并更新。
- 后端本地运行时 env 文件应和前端保持一致，使用 `apps/api/.env.local`。
- 固定 OPML 文件应放在 `apps/api/` 下，因为它现在是后端拥有的运行时输入。
- GitHub Actions 的 e2e 必须在 workflow 内自行拉起 PostgreSQL 18，不能依赖任何外部数据库。

当某个实施单元写到 `Execution target: external-delegate` 时，它只是执行姿态信号，不会改变 scope、依赖顺序或验收标准。

## Package Selection

- 这次切片默认只在 `apps/api` 安装 `feedsmith`。当前 package 调研显示，它可以同时覆盖 OPML 1.0/2.0 和 RSS / Atom / RDF / JSON Feed，适合在 Node/NestJS + TypeScript 环境里先用一套解析面跑通主干。
- 不先安装 `opml`、`rss-parser` 或 `@extractus/feed-extractor`。只有当 `feedsmith` 在真实集成里撞到明确边界时，再退回到拆分 parser 的方案。
- 继续遵守 R17：实现时用 `pnpm` 在 `apps/api` 安装“最新兼容稳定版”，如果依赖解析进入冲突密集区，就停下来显式处理。

## Problem Frame

`apps/api` 现在仍通过 `apps/api/src/articles/article-fixture.repository.ts` 和 `apps/api/src/articles/fixtures/prepared-articles.json` 提供文章列表与详情。这个 fixture seam 在第一条可运行读路径切片里是对的，但现在它已经卡住了 v0.1 的下一个关键里程碑：证明产品能从固定订阅文件读取 feed、抓取真实内容、把真实记录持久化下来，同时继续对外提供同样纤薄的文章读合同。

配对 brainstorm 文档已经把产品问题收得很窄：这次切片不是要一口气做正文抽取、摘要生成、feed 管理、调度系统或更大的后台能力。它只需要证明“入库主干 + 读路径切库”成立。因此 planning 现在要解决的是一组技术交叉面，而不是重新打开产品范围：

- 选出最适合当前 NestJS app 和 monorepo 的 PostgreSQL + Prisma 方案
- 让启动期入库保持 best-effort，而不是 all-or-nothing
- 明确一条能承受重复启动的文章身份规则
- 把运行时配置收回到正确的 app 边界
- 把新的本地数据库与启动流程写进双语耐久文档

## Requirements Trace

### 行为与数据主干

- R1. 系统必须从固定本地文件 `feeds.opml` 读取订阅源，并在本切片中由 `apps/api/` 拥有。
- R2. Feed 入库必须在 API 启动时自动触发。
- R3. 同一次启动里，一个 feed 失败不能阻止其他 feed 被尝试处理。
- R4. 真实 `Feed` 与 `Article` 记录必须持久化到 PostgreSQL；文章 API 必须停止依赖静态 fixture。
- R5. 切库后，`/articles` 与 `/articles/:id` 只能读取持久化记录；即使某次入库只是部分成功，也不能回退到 fixture。
- R6. 文章去重必须以每 feed 为边界，通过应用层推导的确定性 `identityHash` 加数据库唯一约束来保证。
- R7. 现有文章详情里的 `summary` 字段继续作为兼容字段，由 feed 自带 description / excerpt 提供；若不存在则返回空字符串。
- R8. 第一版 `Feed` 模型保持最小，只包含入库、条件抓取与读路径真正需要的字段。
- R9. 这个切片的公开 API 面继续限制在现有只读 `/articles` 合同；不新增 `/feeds` 或入库控制接口。
- R10. 第一版 `Article` 模型必须同时保留 `publishedAt` 与 `ingestedAt`。
- R11. Prisma schema 必须从一开始就是模块化组织，并与后端领域边界对齐，同时保持单一 migration 历史。
- R12. 启动期入库必须输出结构化的 per-feed 日志，并产出能区分“全部成功 / 部分成功 / 全部失败”的启动汇总。
- R13. API 启动不能要求所有 feed 都抓取成功。
- R14. 这个切片在本地运行和测试里都必须统一使用 PostgreSQL；不能引入 SQLite 开发分叉。
- R15. 本地数据库说明必须明确使用 `psql-18`，并把预建好的 `rssift` 与 `rssift_test` 数据库写成既定前置条件。

### 运行时、依赖与 CI 治理

- R16. App 运行时 env 文件应由对应 app 拥有，提交 `.env.example`，并在实现期间创建本地 app env 文件，而不是继续扩张 root 级运行时 env。对本地开发而言，`apps/api` 应使用 `.env.local` 与现有 `apps/web` 约定保持一致。
- R17. 任何新依赖都必须用 `pnpm` 安装到真正拥有它的 workspace，并尽量选择实现时可行的“最新兼容稳定版”；一旦出现 peer conflict、override-heavy 这类分支，就必须停下来显式处理。
- R18. GitHub Actions 的 e2e 路径必须在 workflow 内自行 provision PostgreSQL 18，不能依赖任何外部数据库服务。

### 文档同步

- R19. Root 和 app 级耐久文档在英文与简体中文之间必须保持语义同步。

## Scope Boundaries

- 不新增正文抽取、生成式摘要、翻译或分层阅读 UX。
- 不新增 feed CRUD、OPML 导入导出 UI，也不新增入库控制接口。
- 不新增定时调度、cron 或后台刷新；本切片只做启动期入库。
- 不为本切片新增“持久化的入库运行状态模型”；结构化日志加启动汇总已经足够。
- 不把开发环境与部署环境拆成不同数据库 provider。
- 不让 Web 应用长出新的公开行为；它只继续消费不变的 `/articles` 合同。
- 不把 app 运行时配置重新塞回 root package 或 root README 作为默认归属边界。
- 不在计划里写死迁移命令或安装命令脚本；实现时再决定具体 `pnpm` / Prisma 命令。

## Context & Research

### Relevant Code and Patterns

- `apps/api/src/articles/articles.module.ts`、`apps/api/src/articles/articles.service.ts` 与 `apps/api/src/articles/articles.controller.ts` 展示了当前文章读路径的薄 feature-module 结构。
- `apps/api/src/articles/article-fixture.repository.ts` 与 `apps/api/src/articles/fixtures/prepared-articles.json` 就是这次切片要替换掉的精确 seam。
- `apps/api/src/main.ts` 已经承担启动 bootstrap、CORS 和默认端口逻辑；让生命周期触发的入库挂在这里附近最自然，不必再发明第二个入口。
- `apps/web/src/widgets/article-reader/api/articles-api.ts` 已经把 `API_BASE_URL` 视为必需变量，并明确提到了 `apps/web/.env.local` 或 `apps/web/.env.example`，但仓库里当前缺少 `apps/web/.env.example`。
- 仓库目前有 root `.env`，但没有提交进仓库的 app-owned runtime env example；这与我们想要的 app-owned env 边界是错位的，后端本地文件名也还没有统一到 `.env.local`。
- 当前仓库里还没有 Prisma schema、PostgreSQL 访问层、OPML 文件或 feed ingestion 的既有模式可直接复用。对这部分来说，这是 brownfield monorepo 内的一块 greenfield。
- `turbo.json` 目前定义了 root 级任务编排，也把 `**/.env.*local` 放进了 `globalDependencies`，但它还没有描述 API app 自己的 env 文件，也没有完成本切片所需的更细 env 哈希策略。
- `.github/workflows/pr-quality.yml` 当前运行 `pr-quality / test` 和 `pr-quality / e2e`，但 workflow 还没有为数据库驱动的 API 验证自起 PostgreSQL 18。

### Institutional Learnings

- `docs/en/solutions/developer-experience/root-pnpm-typecheck-uses-turbo-workspace-coverage-2026-04-13.md` 与 `docs/zh-Hans/solutions/developer-experience/root-pnpm-typecheck-uses-turbo-workspace-coverage-2026-04-13.md` 提醒：root `pnpm typecheck` 只证明 Turbo 图里被接进去的东西。任何新的 workspace 级校验，都必须保持 package-owned 并显式接进 Turbo。
- `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md` 与 `docs/zh-Hans/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md` 说明 monorepo 的工作流应从真正拥有它的 package 运行，而不是重新回到 root-only wrapper。
- `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md` 与 `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md` 要求：只要语义、示例或路径发生变化，中英文耐久文档就必须一起改。
- `docs/en/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md` 与 `docs/zh-Hans/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md` 对验证范围也有启发：同时改 app 代码、root 文档和共享配置的工作，不能被误当成纯 app-local 变更。

### External References

- OPML 2.0 规范：`https://opml.org/spec2.opml`
- RSS 2.0 规范：`https://www.rssboard.org/rss-2-0`
- feedsmith 文档：`https://next.feedsmith.dev/`
- feedsmith 包页面：`https://www.npmjs.com/package/feedsmith`
- opml 包页面：`https://www.npmjs.com/package/opml`
- rss-parser 包页面：`https://www.npmjs.com/package/rss-parser`
- @extractus/feed-extractor 包页面：`https://www.npmjs.com/package/@extractus/feed-extractor`
- RSS Best Practices Profile：`https://www.rssboard.org/rss-profile`
- Atom RFC 4287：`https://datatracker.ietf.org/doc/html/rfc4287`
- NestJS lifecycle events：`https://docs.nestjs.com/fundamentals/lifecycle-events`
- NestJS standalone applications：`https://docs.nestjs.com/application-context`
- NestJS configuration：`https://docs.nestjs.com/techniques/configuration`
- Prisma schema location / directory support：`https://www.prisma.io/docs/orm/prisma-schema/overview/location`
- Prisma config reference：`https://www.prisma.io/docs/orm/prisma-schema/prisma-config-reference`
- Prisma multi-schema / provider support：`https://www.prisma.io/docs/orm/prisma-schema/data-model/multi-schema`
- Prisma migration histories：`https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/migration-histories`
- Prisma migrate limitations 与 provider 一致性：`https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues`
- Turborepo env 指南：`https://turborepo.dev/docs/crafting-your-repository/using-environment-variables`
- Turborepo package configurations：`https://turborepo.dev/docs/reference/package-configurations`
- pnpm workspaces：`https://pnpm.io/workspaces`
- pnpm filtering：`https://pnpm.io/filtering`
- pnpm add：`https://pnpm.io/cli/add`
- pnpm update：`https://pnpm.io/cli/update`
- Twelve-Factor Config：`https://12factor.net/config`
- Twelve-Factor Backing Services：`https://12factor.net/backing-services`
- Vercel examples 对 `.env.example` 的要求：`https://github.com/vercel/examples`

## Key Technical Decisions

- 这个切片从头到尾都使用 PostgreSQL。仓库不应该为了本地开发再引入 SQLite provider，因为 Prisma 的 migration history 仍然是 provider-specific 的，而 brainstorm 已经把 split-provider 路径排除了。
- 在 `apps/api` 里使用 Prisma 官方支持的 schema-directory 工作流，并保持单一 migration 历史。计划默认 `apps/api/prisma.config.ts` 指向 schema 目录，`apps/api/prisma/schema/schema.prisma` 作为入口文件，`apps/api/prisma/schema/feed.prisma`、`apps/api/prisma/schema/article.prisma` 承担领域拆分。
- 解析器默认选 `feedsmith`，并只装在 `apps/api`。它是这个切片的首选，因为一套包就能同时处理 API 拥有的 `apps/api/feeds.opml` 与下游 feed 格式，避免一开始就拆成两套 parser。
- Prisma migration 继续以 `apps/api/prisma/migrations/` 为单一事实来源。实现时本地和 CI 可以走不同命令，但不能随意编辑或分叉已应用迁移历史。
- 入库应在 API 启动期间发起，但不能在本地前置条件已经通过之后继续把 feed I/O 变成 HTTP 可用性的阻塞项。bootstrap runner 需要在启动阶段触发入库，同时显式设置每 feed 超时和整轮预算，并允许 API 在受控的后台入库过程中开始提供服务。
- 缺失或无效的本地前置条件属于启动阻断错误：无效数据库配置、无效 bootstrap 配置，或解析后的 OPML 路径缺失/损坏，都应阻止启动。一旦这些前置条件通过，即使整轮 feed 抓取最终是 `full failure`，API 也应继续启动并基于既有持久化数据提供服务，同时由日志报告该状态。
- 现在就把文章 identity contract 明确下来：优先使用源端稳定 id（`guid`、`atom:id` 或等价 item id），其次是规范化 canonical URL，最后才是确定性的内容签名。URL 规范化至少要做到：去除首尾空白、解析绝对 URL、scheme 与 host 小写化、去掉 fragment 与默认端口、保留 path 与 query，并把空 path 视为 `/`。最后的内容签名则基于 feed 作用域下的“规范化标题 + 来源发布时间（若存在）+ 压缩空白后的 description/excerpt”组合。
- 除了 `identityHash`，还要持久化 identity 审计字段：保留最强的原始 `sourceId`，并新增 `identitySourceType` 与 `identitySourceValue`，记录真正参与哈希的 canonical 输入。一旦文章行已存在，这个 canonical identity 输入就应视为不可变，避免 parser 或规范化策略变化悄悄改写去重行为。
- 公开给 `/articles` 与 `/articles/:id` 的 article `id` 使用数据库生成的不可变主键。它在首条插入时生成，后续重复入库继续复用，不能由 `identityHash` 重新计算。
- Feed 级运行状态仍保持最小。只保留未来条件抓取需要的 `etag` 与 `lastModified` 等字段，不新增持久化 run-state 表。但每个 feed 的写入必须保持原子性：某个 feed 的元数据和文章变更要么一起提交，要么一起回滚；本切片也不因为某次抓取未出现旧文章，就直接删除既有持久化记录。
- 运行时 env 的归属改成 app-local。`apps/api` 拥有数据库 env example、本地 `apps/api/.env.local` 与 bootstrap 开关；`apps/web` 拥有 `API_BASE_URL` example 与本地覆盖；root `.env` 只留 repo-global tooling secret。固定文件名继续使用 `feeds.opml`，但路径解析必须通过 app config（例如 `FEED_OPML_PATH`）完成，默认值再指向 `apps/api/feeds.opml`，而不是假设所有模式下的 `process.cwd()` 都是仓库根目录。
- 所有本地 PostgreSQL 校验语言都必须写成 `psql-18`。这不是“可选措辞”，而是仓库特定的操作者约束。
- 测试生命周期控制本身也是架构的一部分，不是实现时再临场补的细节。`apps/api` 必须拥有 package-local 的 test DB migrate/reset 策略，以及像 `INGEST_ON_BOOT=false`、OPML 路径覆盖这样的 bootstrap 控制，让 `test` 与 `test:e2e` 默认不依赖本地文件或外网 feed。
- CI 数据库归属也应一并明确：GitHub workflow 里的数据库驱动 e2e 必须在 job 内自行 provision PostgreSQL 18，并在该 job 里创建临时数据库，而不是依赖任何外部主机。
- 依赖安装策略本身就是计划的一部分：新 registry package 用 `pnpm` 装到真正拥有它的 workspace，尽量选择实现当时“最新且兼容的稳定版”；workspace package 继续使用 `workspace:*`。如果安装需要 override、强行 peer-resolution 或其他 conflict-heavy 手段，执行必须停下来显式处理。
- 对外文章 API 合同继续保持不变。读路径底层会从 fixture 切到 PostgreSQL，但 `GET /articles` 与 `GET /articles/:id` 仍然是唯一公开 surface，字段形状不变。

## Resolved During Planning

- **固定 OPML 文件应该放哪里？** 继续保留固定文件名 `feeds.opml`，但通过 API 配置（例如 `FEED_OPML_PATH`）解析路径。默认开发值仍指向 `apps/api/feeds.opml`，而测试和其他运行时可以显式覆盖。
- **在计算 hash 之前，identity 的精确回退顺序是什么？** 先源端稳定 id，再规范化 canonical URL，最后才是确定性的内容签名。
- **除了 `identityHash`，还需要持久化什么才能便于排障和后续修复？** 需要同时持久化 `identitySourceType`、`identitySourceValue` 以及最强原始 `sourceId`。
- **公开 article `id` 用什么？** 使用数据库生成的不可变主键，首条插入时生成，后续重复入库继续复用。
- **除了日志之外，还需要额外持久化入库错误记录吗？** 不需要。结构化 per-feed 日志加启动汇总已经足够满足 v0.1 第二切片。
- **Prisma 模块化要如何和后端架构对齐？** 保持单一 `apps/api/prisma/` migration root，但把 schema 文件按领域拆开，避免 feed/article 继续挤进一个长期失控的大文件。
- **运行时 env 文件由谁拥有？** 由真正消费它的 app 拥有。`apps/api` 管数据库 env 和 bootstrap 开关，并使用 `apps/api/.env.local` 作为本地运行时文件；`apps/web` 管 `API_BASE_URL`，并使用 `apps/web/.env.local`；root `.env` 不再作为 app 运行时配置的默认位置。
- **本地 DB 访问应该如何写进文档？** 所有本地文档都应把下面两个数据库视为已经 provisioned，并统一用 `psql-18` 做检查说明：
  - `DATABASE_URL="postgresql://rssift:rssift@127.0.0.1:5432/rssift"`
  - `TEST_DATABASE_URL="postgresql://rssift:rssift@127.0.0.1:5432/rssift_test"`
- **`full failure` 会阻止 API 启动吗？** 不会。只有本地前置条件无效才阻断启动；一旦 bootstrap 前置条件通过，即使整轮 feed 抓取是 `full failure`，API 也继续基于既有持久化数据提供服务。
- **测试应如何控制启动期入库？** 通过 app-owned 的 bootstrap 控制，例如 `INGEST_ON_BOOT=false`、显式 OPML 路径覆盖，以及 `apps/api` 内部 package-owned 的 test DB migrate/reset 工作流。
- **默认 parser 应该先选什么？** 先在 `apps/api` 安装 `feedsmith`；只有在真实集成里证明它不够用时，才退回到拆分 parser 的方案。
- **CI e2e 的 PostgreSQL 应如何处理？** `.github/workflows/pr-quality.yml` 应在 workflow 内自起 PostgreSQL 18，创建该 job 所需的临时测试库，并注入 CI 专用 DB env，而不是依赖任何外部数据库。

## Deferred to Implementation

- 每 feed 网络超时和整轮入库预算的精确数值，只要这两层限制真实存在、可测试，而且不会重新把 feed I/O 变成隐性 readiness gate。
- env 哈希调整到底只改 root `turbo.json`，还是还需要 package-local Turbo config。
- package-owned 的 test DB migrate/reset 脚本与 bootstrap override helper 的具体命名，只要 `apps/api` 真正拥有这套生命周期，而且测试默认不依赖 live feeds。

## Dependencies / Prerequisites

- Node.js `24.14.1` 或更高版本，以及 `pnpm@10.33.0` 或更高版本。
- 本地 PostgreSQL 可通过 `127.0.0.1:5432` 访问，且 `rssift` 与 `rssift_test` 已预建。
- 本地可用的 PostgreSQL 客户端命令为 `psql-18`。
- API 启动前，`apps/api/feeds.opml` 必须在本地存在。
- 需要接受一个或多个新的 `apps/api` 依赖（Prisma 与 feed 解析相关），前提是它们满足 R17 的安装策略。

## Alternative Approaches Considered

- **再保留一个切片的 fixture** —— 否决，因为 R4 与 R5 已经明确把 fixture cutover 定义成了本切片的一部分。
- **本地 SQLite、其他环境 PostgreSQL** —— 否决，因为 Prisma migration history 是 provider-specific，brainstorm 也已把 split-provider 路径排除。
- **现在就持久化一整套 ingestion run-state** —— 否决，因为结构化日志加启动汇总已经足够满足本切片的可运维要求，没有必要继续扩 scope。
- **把所有运行时 env 继续放在 root** —— 否决，因为 Turborepo 官方更鼓励 app-owned env，而当前仓库也已经出现了 app env 与文档错位的问题。
- **只要有任何 feed 失败就让 API 启动失败** —— 否决，因为 R3 与 R13 都要求 feed 级隔离与 best-effort 启动。

## High-Level Technical Design

> _这一节用于表达预期方案形状，供评审确认方向；它是方向性指导，不是实现规范。执行者应把它当作上下文，而不是可直接照抄的代码。_

```mermaid
flowchart TB
    OPML[apps/api/feeds.opml] --> Bootstrap[API startup bootstrap]
    Env[apps/api/.env.local] --> Bootstrap
    Bootstrap --> Ingest[Feed ingestion orchestrator]
    Ingest --> Loop[Per-feed fetch and parse loop]
    Loop --> Identity[Identity derivation]
    Identity --> Persist[Prisma upsert into PostgreSQL]
    Persist --> Logs[Structured per-feed logs + startup summary]
    Persist --> Articles[Article read repository]
    Articles --> List[GET /articles]
    Articles --> Detail[GET /articles/:id]
    WebEnv[apps/web/.env.local] --> Web[apps/web article reader]
    List --> Web
    Detail --> Web
```

## Implementation Units

```mermaid
flowchart TB
    U1[Unit 1: App-owned config and env baseline] --> U2[Unit 2: Prisma/PostgreSQL schema baseline]
    U1 --> U3[Unit 3: Startup ingestion pipeline]
    U2 --> U3
    U2 --> U4[Unit 4: Persisted article read-path cutover]
    U3 --> U4
    U2 --> U5[Unit 5: CI e2e PostgreSQL 18 workflow]
    U4 --> U5
    U1 --> U6[Unit 6: Bilingual bootstrap docs and examples]
    U5 --> U6
```

- [x] **Unit 1: 建立 app-owned runtime config、env example 与 bootstrap 控制边界**

**Goal:** 把运行时配置的归属收回到对应 app，写清楚既定的本地 PostgreSQL 前置条件，并补齐最小化的 bootstrap/test 控制面。

**Requirements:** R14, R15, R16, R17, R19

**Dependencies:** None

**Files:**

- Modify: `apps/api/package.json`
- Modify: `turbo.json`
- Create: `apps/api/.env.example`
- Create: `apps/web/.env.example`
- Create: `apps/api/feeds.opml.example`
- Create (local-only): `apps/api/.env.local`
- Create (local-only): `apps/web/.env.local`
- Create (local-only): `apps/api/feeds.opml`
- Create: `apps/api/src/config/app-config.ts`
- Create: `apps/api/src/config/app-config.spec.ts`
- Create: `apps/api/src/config/env.validation.ts`

**Approach:**

- 新增最小 API config 层，校验 `DATABASE_URL`、`TEST_DATABASE_URL`、`FEED_OPML_PATH` 与 `INGEST_ON_BOOT`，并把已经 provisioned 的本地数据库值写成文档默认值。
- 提交 `apps/api/.env.example` 和 `apps/web/.env.example`，并把本地运行时文件统一成 `apps/api/.env.local` 与 `apps/web/.env.local`。
- 默认 OPML 路径应从 `apps/api` package root 解析，而不是依赖 `process.cwd()`；这样 `pnpm --filter api dev`、测试模式和 build 后启动模式都能指向同一份默认 `apps/api/feeds.opml` 文件，除非显式覆盖。
- 收紧 Turbo 哈希，让 app-owned env 文件变化能触发相关任务失效，而不是继续依赖 root-only 假设。
- 保持 package 变更最小。只有当 package-owned 的 bootstrap/test 生命周期确实需要脚本接线时，才修改 `apps/api/package.json`；不要默认把 `apps/web/package.json` 纳入这个单元。
- 在 config-facing 文档与验证语义里统一写 `psql-18`，不使用泛化的 `psql`。

**Execution note:** 在安装任何新 registry package 之前，先把完整 package 清单按 workspace ownership 分组告知用户。这个单元应把 root package 的变更限制在真正的 repo-level tooling 或 task-graph 更新上。

**Patterns to follow:**

- `apps/web/src/widgets/article-reader/api/articles-api.ts`
- `README.md`
- `README.zh-Hans.md`
- `turbo.json`

**Test scenarios:**

- Happy path — API config bootstrap 能从 `apps/api/.env.local` 读取 `DATABASE_URL`、`TEST_DATABASE_URL`、`FEED_OPML_PATH` 与 `INGEST_ON_BOOT`，并对下游模块暴露正确值。
- Error path — 缺失 `DATABASE_URL` 时，API 启动给出清晰配置错误，而不是静默回退。
- Error path — 缺失 `TEST_DATABASE_URL` 时，测试 bootstrap 或测试配置解析给出明确错误，而不是默认回运行库。
- Edge case — `INGEST_ON_BOOT=false` 时，单元测试和 e2e 测试可以禁用启动期入库，同时仍能正常启动应用模块。
- Integration — 默认 `FEED_OPML_PATH` 在 `pnpm --filter api dev`、测试覆盖模式与 build 后 `start:prod` 模式下都能解析到同一份 `apps/api/feeds.opml` 文件。
- Integration — `apps/api/.env.example`、`apps/api/.env.local` 或 `apps/web/.env.local` 变化时，相关 Turbo 任务不会错误复用旧缓存。

**Verification:**

- 运行时配置已经是 app-owned，既定本地 DB URL 已明确写清，默认 OPML 路径在不同运行模式下可重复解析，而且测试能够禁用或重定向启动期入库，而不依赖操作者本地文件。

- [x] **Unit 2: 加入 Prisma PostgreSQL 基线，采用模块化 schema 目录与单一 migration 历史**

**Goal:** 在不破坏 feature-module 边界与 Prisma 迁移约束的前提下，为这个切片引入数据库访问基础层。

**Requirements:** R4, R6, R8, R10, R11, R14, R17

**Dependencies:** Unit 1

**Files:**

- Modify: `apps/api/package.json`
- Create: `apps/api/prisma.config.ts`
- Create: `apps/api/prisma/schema/schema.prisma`
- Create: `apps/api/prisma/schema/feed.prisma`
- Create: `apps/api/prisma/schema/article.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_init_feed_ingestion/migration.sql`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/prisma/prisma.service.spec.ts`
- Create: `apps/api/test/prisma-schema.e2e-spec.ts`

**Approach:**

- 只在 `apps/api` 内引入 Prisma，不把数据库依赖提升到 root，保证依赖归属继续对齐 API app。
- 使用 Prisma 官方 schema-directory 工作流：保留一个入口 schema 文件，把 feed 与 article 模型拆到各自领域文件里，同时在 `apps/api/prisma/migrations/` 下保持单一 migration 历史。
- `Feed` 模型保持最小，只含 `feedUrl`、`siteTitle`、`siteUrl`、`etag`、`lastModified` 与时间戳。
- `Article` 模型包含不可变的公开 `id`、`feedId`、`identityHash`、`identitySourceType`、`identitySourceValue`、`sourceId`、`title`、`originalUrl`、`publishedAt`、`ingestedAt`、`summary` 与时间戳。
- 数据库约束直接承接 planning 决策：唯一 `feedUrl`、复合唯一 `(feedId, identityHash)`、`feedId` 索引与 `publishedAt` 索引。
- 运行时与测试统一使用 PostgreSQL provider；不要新增第二套 schema 分支或第二条 migration 历史。

**Execution note:** 这个单元是纯代码 / schema 工作，完成 package 披露后很适合委派实现；委派不会改变 scope 或验收标准。

**Patterns to follow:**

- `apps/api/src/articles/articles.module.ts`
- `AGENTS.md` 对后端 feature-module 对齐的要求
- 上面列出的 Prisma 官方 schema directory 与 migration 文档

**Test scenarios:**

- Happy path — 生成后的 schema 能在测试数据库里创建出 `Feed` 与 `Article` 表、关系、时间戳以及 identity 审计字段。
- Edge case — 重复插入同一个 `feedUrl` 会被数据库唯一约束拒绝。
- Edge case — 同一 feed 下重复插入相同 `identityHash` 会被拒绝，但不同 feed 之间允许相同 hash。
- Integration — 把 migration 应用到 `TEST_DATABASE_URL` 后，得到的 schema 形状与运行时预期一致，不发生 provider mismatch。
- Integration — 同一逻辑文章被重复 upsert 时，已经存在的公开 `id` 保持不变。

**Verification:**

- `apps/api` 已拥有 PostgreSQL-ready 的 Prisma 基线，schema 文件模块化、migration 历史单一、公开 article `id` 稳定，而且具备入库去重所需的最小约束。

- [x] **Unit 3: 实现启动期 feed 入库，保证 per-feed 失败隔离与确定性 identity 派生**

**Goal:** 加入真正的入库主干：读取 `feeds.opml`、独立抓取 feed、推导稳定 identity、以每 feed 原子化地持久化结果，并输出可诊断日志，同时不把局部或整体 feed 失败升级成整体 API 启动失败。

**Requirements:** R1, R2, R3, R5, R6, R8, R10, R12, R13, R14, R15, R16

**Dependencies:** Unit 1, Unit 2

**Files:**

- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/test/articles.e2e-spec.ts`
- Create: `apps/api/src/feeds/feeds.module.ts`
- Create: `apps/api/src/feeds/feed-bootstrap.service.ts`
- Create: `apps/api/src/feeds/feed-ingestion.service.ts`
- Create: `apps/api/src/feeds/article-identity.service.ts`
- Create: `apps/api/src/feeds/feed-bootstrap.service.spec.ts`
- Create: `apps/api/src/feeds/article-identity.service.spec.ts`
- Create: `apps/api/test/feed-ingestion.e2e-spec.ts`

**Approach:**

- 用感知生命周期的 bootstrap runner 在 API 启动阶段发起入库，但在本地前置条件通过之后，不能继续让 feed I/O 阻塞 HTTP 可用性。
- 同时设置每个 feed 的网络超时和整轮入库预算；一旦任一预算耗尽，就把对应 feed 或剩余工作标记为失败/超时，输出启动汇总，并继续让 API 基于既有持久化数据提供服务。
- `feeds.opml` 通过 Unit 1 里解析出的绝对路径读取，默认值指向 `apps/api/feeds.opml`，但测试和其他运行时可以显式覆盖该路径。
- 这个切片默认保持最小抽象：一个 bootstrap/orchestration service 加一个 identity helper 就够了。只有在实现过程中真的出现第二个调用方、第二种触发方式或第二种输入源时，才拆出独立 OPML repository、fetcher service 或共享 types。
- 默认使用 `feedsmith` 处理 API 拥有的 OPML 文件和下游 feed 解析；只有在真实集成里遇到明确边界时，才退回到拆分 parser 的方案。
- 严格执行 planning 阶段锁定的 identity contract：稳定源 id 优先，其次是规范化 URL，最后是确定性的内容签名；并持久化 `identitySourceType`、`identitySourceValue` 与最强原始 `sourceId`。
- 每个 feed 的写入都放在一个 feed-scoped 事务里，使该 feed 的元数据和文章变更要么一起提交，要么一起回滚。本切片不因为某次抓取未出现旧文章，就直接删除既有持久化记录。
- 在 package-owned 测试里通过 `INGEST_ON_BOOT=false` 和 OPML 路径覆盖禁用真实网络 bootstrap，让单元测试和 e2e 默认不依赖 repo-local 操作者文件或 live feeds。
- 为每个 feed 输出结构化日志，并在启动末尾输出明确区分全部成功 / 部分成功 / 全部失败的 summary。一旦本地前置条件通过，即使整轮 feed 抓取是 `full failure`，API 也继续提供既有持久化数据。

**Execution note:** 先从 identity fallback 顺序、超时预算行为和重复启动去重写失败测试开始。这个单元风险较高，因为它同时触及持久化、外部 feed 与启动行为。

**Patterns to follow:**

- `apps/api/src/main.ts`
- `apps/api/src/articles/articles.module.ts`
- 引用的 NestJS lifecycle 官方文档

**Test scenarios:**

- Happy path — 一个合法的 `feeds.opml` 指向多个可访问 feed 时，会写入 feed 和 article 记录，并输出 per-feed success 日志与成功启动汇总。
- Edge case — 带稳定源 id 的 item 会优先使用该 id 作为 canonical identity 输入。
- Edge case — 缺失稳定源 id 的 item 会回退到规范化 URL；连 URL 也没有时，再回退到规划里锁定的确定性内容签名。
- Error path — 某个 feed 超时或返回畸形数据时，该 feed 的失败会被单独记录，启动汇总变成 partial success，而其余 feed 仍继续在整轮预算内被尝试。
- Error path — 缺失或格式错误的 `feeds.opml` 默认路径会给出清晰 bootstrap 失败，而不是静默以零订阅启动。
- Integration — `INGEST_ON_BOOT=false` 时，测试环境能够禁用真实网络 bootstrap，但 API 仍可基于测试数据库正常初始化。
- Integration — 在 feed 内容不变的前提下重复启动应用，不会在同一 feed 下重复生成 `Article` 行，而且已知文章的公开 `id` 保持不变。

**Verification:**

- 启动期入库具备边界清晰的超时与整轮预算、per-feed 失败隔离和 feed 级原子写入；一旦本地前置条件通过，即使入库最终是 partial/full failure，API 也仍能基于既有持久化数据提供服务。

- [x] **Unit 4: 把文章 API 彻底切到 Prisma 持久化读路径**

**Goal:** 用持久化读路径替换 fixture repository，同时继续保持 Web 依赖的对外文章合同不变。

**Requirements:** R4, R5, R6, R7, R9, R10, R12, R13

**Dependencies:** Unit 2, Unit 3

**Files:**

- Modify: `apps/api/src/articles/articles.module.ts`
- Modify: `apps/api/src/articles/articles.service.ts`
- Modify: `apps/api/src/articles/articles.controller.ts`
- Modify: `apps/api/src/articles/articles.controller.spec.ts`
- Create: `apps/api/src/articles/article.repository.ts`
- Create: `apps/api/src/articles/article.repository.spec.ts`
- Modify: `apps/api/test/articles.e2e-spec.ts`
- Delete: `apps/api/src/articles/article-fixture.repository.ts`
- Delete: `apps/api/src/articles/fixtures/prepared-articles.json`

**Approach:**

- 用 Prisma-backed repository 或 query service 替换 fixture-backed repository，并继续由 `articles` feature 拥有这条读路径。
- 保持 `GET /articles` 与 `GET /articles/:id` 的响应形状不变，这样 `apps/web` 可以继续消费同一份合同。
- 列表返回和详情路由都使用数据库生成的不可变 article 主键作为公开 `id`；这个值在后续重复入库时不得漂移。
- `summary` 字段从数据库读取 feed 自带文本；若持久化时没有摘要样文本，则返回空字符串。
- 切库后，运行时读路径必须完全数据库化。即使最近一次入库只是部分成功，或者本次启动失败，也只能返回当前数据库里已有的持久化数据，不能回退到 fixture。
- 为列表查询定义明确的排序策略，让从 fixture 切到持久化后结果仍保持稳定、可预测。

**Execution note:** 这个单元在 Unit 3 之后也适合委派，因为对外合同已经冻结、验收边界清晰；委派不会改变 scope 或验收标准。

**Patterns to follow:**

- `apps/api/src/articles/articles.controller.ts`
- `apps/api/src/articles/articles.service.ts`
- `apps/web/src/widgets/article-reader/api/articles-api.ts`

**Test scenarios:**

- Happy path — `GET /articles` 只返回持久化记录，并继续保持现有列表字段，不出现 `summary`。
- Happy path — `GET /articles/:id` 返回持久化详情数据，`summary` 来自数据库或为空字符串。
- Edge case — 最近一次入库只是部分成功时，之前已经持久化的数据仍然可读，而且不会触发 fixture fallback。
- Edge case — 对同一篇已知文章重复入库后，列表和详情接口返回的公开 `id` 保持不变。
- Error path — 请求未知 article id 时仍然返回 `404`。
- Integration — 删除 fixture 文件后，运行时文章读取行为不再发生变化，因为 API 已完全由 PostgreSQL 支撑。

**Verification:**

- 对外文章 API 继续与 Web 端合同兼容，已知文章在重复入库后仍保持稳定公开 `id`，而运行时数据源已经完全切到 PostgreSQL。

- [x] **Unit 5: 更新 GitHub Actions e2e，使其自起 PostgreSQL 18**

**Goal:** 让 CI e2e 校验自包含，在 GitHub Actions 内自己拉起 PostgreSQL 18，而不是依赖任何外部数据库。

**Requirements:** R14, R17, R18

**Dependencies:** Unit 2, Unit 4

**Files:**

- Modify: `.github/workflows/pr-quality.yml`
- Modify: `apps/api/package.json`
- Modify: `apps/api/test/jest-e2e.json`
- Modify: `apps/api/test/articles.e2e-spec.ts`
- Create: `apps/api/test/ci-db-bootstrap.ts`

**Approach:**

- 更新 `pr-quality / e2e`，让 workflow 在 job 内自行 provision PostgreSQL 18（优先用 job-local service container），而不是依赖任何外部数据库主机。
- 在该 workflow run 内创建 CI 所需的测试数据库，并注入 CI 专用 DB env。已经 provisioned 的本地 `rssift` / `rssift_test` 只属于本地假设，不应被 CI 复用。
- 让 workflow 保持自包含：数据库启动、健康检查、schema migration/reset 与 API e2e bootstrap 都在 job 内完成。
- 如果这个切片让 `pr-quality / test` 也开始依赖数据库，应复用同样的 PostgreSQL 18 自 provision 策略，而不是重新引入外部依赖。
- 在 workflow 配置和 CI 说明里明确写出 PostgreSQL 18，避免 runner 默认版本悄悄漂移。

**Patterns to follow:**

- `.github/workflows/pr-quality.yml`
- `docs/en/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`
- `docs/zh-Hans/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`

**Test scenarios:**

- Happy path — `pr-quality / e2e` 在 workflow 内起 PostgreSQL 18、完成 migration，并在没有任何外部数据库的前提下跑通 API-backed e2e。
- Error path — PostgreSQL 18 service 未健康时，workflow 在 e2e 启动前显式失败，而不是让应用启动长时间卡住。
- Integration — CI 注入的 DB env 只指向 workflow 内自起的 PostgreSQL，API e2e 不再依赖本地机器或外部数据库假设。

**Verification:**

- GitHub 托管 e2e 已经是自包含、数据库驱动且可复现的 clean-runner 流程，不依赖任何外部 PostgreSQL 实例。

- [x] **Unit 6: 同步双语启动文档、app README 与本地 example 文件**

**Goal:** 把新的入库工作流写成可复现的操作者 / 贡献者文档，并让已跟踪 example 文件与真实本地启动形状保持一致。

**Requirements:** R15, R16, R17, R18, R19

**Dependencies:** Unit 1, Unit 4, Unit 5

**Files:**

- Modify: `README.md`
- Modify: `README.zh-Hans.md`
- Modify: `apps/api/README.md`
- Modify: `apps/web/README.md`
- Modify: `apps/api/.env.example`
- Modify: `apps/web/.env.example`
- Modify: `apps/api/feeds.opml.example`

**Approach:**

- 更新 root 双语 README，明确新的本地启动路径：app-owned env 文件、`apps/api/feeds.opml`、已经 provisioned 的 runtime / test PostgreSQL 数据库，以及本地数据库说明必须使用 `psql-18`。
- 同步更新 app 级 README：`apps/api` 要解释入库 / bootstrap 工作流、本地 `apps/api/.env.local` 约定、`apps/api/feeds.opml` 位置，以及初始 parser 选择 `feedsmith`；`apps/web` 要说明虽然 API 不再 fixture-backed，但它仍然只需要 `API_BASE_URL`。
- 保持中英文两棵文档树语义一致：相同的文件位置、相同的数据库 URL、相同的启动顺序、相同的 `psql-18` 说法，以及相同的 `.env.example` / `.env.local` 命名约定与 `apps/api/feeds.opml` ownership 说明。
- 让已跟踪的 example 文件保持真实，避免贡献者面对“README 写了，但文件并不存在”的 bootstrap 断点。

**Patterns to follow:**

- `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`
- `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`
- `README.md`
- `README.zh-Hans.md`

**Test scenarios:**

- Test expectation: none -- 这个单元关注耐久文档与已跟踪 example 文件同步，不是可执行运行时行为。

**Verification:**

- 英文与简体中文文档描述的是同一条启动工作流，example env 文件与真实 app ownership 一致，而且本地 PostgreSQL 说明始终明确引用 `psql-18`、`DATABASE_URL` 与 `TEST_DATABASE_URL`。

## System-Wide Impact

- **Interaction graph:** API 启动现在会跨越 config 读取、OPML 文件访问、feed 抓取/解析、Prisma 持久化以及文章 HTTP 读取，然后 Web 继续消费不变的 `/articles` 合同。
- **Error propagation:** 无效 app 配置或缺失必要 `feeds.opml` 应清晰阻断 bootstrap；单个 feed 的失败则应退化成 per-feed 结构化日志与 partial-success 汇总，而不是直接终止进程。
- **State lifecycle risks:** 如果 identity 派生与数据库唯一约束不一致，重复启动就会产生重复数据；如果 upsert 策略不仔细，部分写入也可能让读取结果出现不一致。
- **API surface parity:** `GET /articles` 与 `GET /articles/:id` 仍然是唯一对外读接口；`apps/web` 不应因为这个切片而被迫改合同。
- **Integration coverage:** 证明这个切片成立，不能只靠单元测试：需要验证启动入库能把数据写进 DB、重复启动仍能去重，以及 HTTP 文章 API 确实读取同一份持久化状态。
- **Unchanged invariants:** 这个切片仍然不新增 feed CRUD、入库控制接口、调度器、生成式摘要、鉴权、分页或筛选。

## Risks & Dependencies

| Risk                                                                       | Mitigation                                                                                                                                                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 上游 feed 的 item 标识不稳定，仍可能产生重复压力                           | 在代码和测试里锁死 fallback 顺序，保存 `sourceId`、`identitySourceType` 与 `identitySourceValue` 便于诊断，并在 PostgreSQL 上强制 `(feedId, identityHash)` 唯一 |
| app-owned env 文件若没有正确进入 Turbo 哈希，会出现缓存失真                | 把 env 哈希故事作为 Unit 1 的一部分，而不是把 env 变化当成文档问题处理                                                                                          |
| Prisma provider 漂移或 migration history 使用不当，会造成本地 / 测试不一致 | PostgreSQL 保持唯一 provider，migration root 统一放在 `apps/api/prisma/migrations/`，且不要随意改动已应用迁移                                                   |
| 启动期网络失败可能被误读成整体应用 readiness 问题                          | 只有本地前置条件无效时才 hard fail；同时给每 feed 与整轮入库设置明确预算，并把隔离后的失败写进 startup summary                                                  |
| 测试可能被本地 OPML、live feed 或脏测试库状态绑死                          | 在 `apps/api` 内补齐 bootstrap 开关、OPML 路径覆盖和 test DB migrate/reset 策略，让 `test` 与 `test:e2e` 可重复运行                                             |
| CI e2e 仍依赖外部数据库并偏离 PostgreSQL 18 基线                           | 在 GitHub Actions 内自行 provision PostgreSQL 18、显式做健康检查，并只把 workflow 自己的 DB env 注入 e2e 路径                                                   |
| 新依赖安装可能触发依赖冲突或未经审查的版本漂移                             | 只在真正拥有它的 workspace 里用 `pnpm` 安装，优先最新兼容稳定版，一旦需要 override 或 peer-workaround 就停下来显式处理                                          |

## Documentation / Operational Notes

- Root 双语 README 应与 app README、example 文件在同一次实现中一起更新。
- 本地操作者文档必须明确说明 runtime 与 test 数据库已经 provisioned 为 `rssift` 与 `rssift_test`。
- 所有本地数据库说明和验证语义都必须写成 `psql-18`。
- OPML 相关文档应直接链接 OPML 2.0 官方规范，并明确 API 拥有的本地文件是 `apps/api/feeds.opml`。
- 这份计划不要求生产部署拓扑发生变化；本切片只需要一个适合单个自托管操作者的单实例 PostgreSQL 假设。
- 如果实现中创建了本地 env 文件或 `feeds.opml`，应继续保持它们位于 `apps/api/` 或对应 app 的 ownership 内，不要把它们误常态化成 root 级运行时配置。
- CI 说明还应明确：GitHub 托管 e2e 会在 workflow 内自起 PostgreSQL 18，因此不依赖本地预建数据库。

## Sources & References

- **Origin documents:** `docs/en/brainstorms/2026-04-15-v0-1-slice-2-feed-ingestion-requirements.md` + `docs/zh-Hans/brainstorms/2026-04-15-v0-1-slice-2-feed-ingestion-requirements.md`
- **Related prior plan:** `docs/en/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md` + `docs/zh-Hans/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md`
- **Current read-path seam:** `apps/api/src/articles/article-fixture.repository.ts`
- **Current article service:** `apps/api/src/articles/articles.service.ts`
- **Current web API client:** `apps/web/src/widgets/article-reader/api/articles-api.ts`
- **Institutional learnings:**
  - `docs/en/solutions/developer-experience/root-pnpm-typecheck-uses-turbo-workspace-coverage-2026-04-13.md`
  - `docs/zh-Hans/solutions/developer-experience/root-pnpm-typecheck-uses-turbo-workspace-coverage-2026-04-13.md`
  - `docs/en/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`
  - `docs/zh-Hans/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`
  - `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`
  - `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`
