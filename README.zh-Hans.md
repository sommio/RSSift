# RSSift

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-Hans.md">中文</a>
</p>

RSSift 是一个基于 Turborepo 的 AI 辅助 RSS 筛选工具单仓库。
它的目标是拉取 feed、生成摘要、提供双栏桌面视图，并在需要时跳转原文。

## 当前状态

- 项目目前处于敏捷、迭代式开发中。
- 已完成第一条端到端切片，作为当前可工作的切片。
- `apps/api` 现在会在启动时把 feed 入库到 PostgreSQL，并提供持久化的文章列表与详情接口。
- `apps/web` 渲染阅读器界面，并通过 HTTP 消费 API。
- 可复用的 UI 基础组件位于 `packages/ui`。

## 项目方向

- 这个项目是一个以筛选为核心的 RSS 工作流，不是一个完整的阅读器。
- 当前重点是文章筛选、摘要生成，以及跳转到原文。
- 当前实现会通过敏捷、迭代式交付持续演进。

## 环境要求

- Node.js 24.14.1 或更高版本
- pnpm 10.33.0 或更高版本

## 本地运行

1. 先创建 app 级别的本地环境文件：

```bash
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
cp apps/api/feeds.example.opml apps/api/feeds.opml
```

2. 启动任何服务前，先检查并按需修改本地环境变量：

- `apps/api/.env.local`
  - `DATABASE_URL` 对应开发数据库，`db:deploy`、`db:reset`、`db:seed`
    以及 API 本地运行都使用它。
  - `TEST_DATABASE_URL` 仅供自动化测试流程使用。
  - `FEED_OPML_PATH` 默认指向 `./feeds.opml`。
  - `INGEST_ON_BOOT=true` 表示本地 API 启动时会执行 feed 入库。
- `apps/web/.env.local`
  - `API_BASE_URL` 应该指向本地 API，通常是
    `http://127.0.0.1:3000`。

3. 安装依赖：

```bash
pnpm install
```

4. 用 `psql-18` 检查本地 PostgreSQL 18 前置条件：

```bash
psql-18 postgresql://rssift:rssift@127.0.0.1:5432/rssift -c 'select current_database();'
psql-18 postgresql://rssift:rssift@127.0.0.1:5432/rssift_test -c 'select current_database();'
```

本地默认数据库：

- `DATABASE_URL=postgresql://rssift:rssift@127.0.0.1:5432/rssift`
- `TEST_DATABASE_URL=postgresql://rssift:rssift@127.0.0.1:5432/rssift_test`

5. 启动 API 前，先把仓库里已提交的 Prisma 迁移应用到开发数据库：

```bash
pnpm --filter api db:deploy
```

6. 如需开发示例数据，可再导入一份固定 seed：

```bash
pnpm --filter api db:seed
```

7. 在一个终端启动 API：

```bash
pnpm --filter api dev
```

8. 在另一个终端启动 Web 应用：

```bash
pnpm --filter web dev
```

本地默认地址如下：

- API: `http://127.0.0.1:3000`
- Web: `http://127.0.0.1:3001`

## 本地质量检查

执行 `pnpm install` 后，Husky 会自动安装仓库内的本地 Git hooks。

- `pre-commit` 会运行 `pnpm lint:staged`：已暂存的 JS/TS 文件会先经过 Prettier 再执行 ESLint，已暂存的 CSS/HTML/JSON/Markdown 文件只会执行 Prettier。
- `pre-push` 会运行 `pnpm typecheck`，直接复用现有的 workspace typecheck 门禁。
- 本地 hooks 不会运行 `pnpm test:e2e`。
- `pre-push` 可能比 `pre-commit` 更慢，因为当前的 Turborepo 任务图可能会在 `typecheck` 前触发上游 `build` 前置步骤。

如果 hook 失败，请先修复报错，再重新执行同一条 Git 命令。你也可以手动运行这些检查：

```bash
pnpm lint:staged
pnpm typecheck
```

## 常用命令

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

`apps/api` 里的开发数据库 Prisma 命令：

```bash
pnpm --filter api db:generate
pnpm --filter api db:migrate
pnpm --filter api db:deploy
pnpm --filter api db:reset
pnpm --filter api db:seed
```

这些命令都作用于 `DATABASE_URL` 指向的开发数据库。拉取仓库后做 schema
对齐，优先使用 `db:deploy`；只有在你确实要创建或迭代新的本地迁移时，才使
用 `db:migrate`。如果要重建开发数据库，请使用 `db:reset`；如果要导入固定
的开发示例数据，请使用 `db:seed`。测试数据库由测试程序通过
`TEST_DATABASE_URL` 在内部处理，不再作为开发者操作命令暴露。

仓库根目录的 `pnpm dev` 不会再隐式执行 Prisma 迁移。只要本地 schema
落后于迁移历史，请先显式运行 API 迁移命令，再启动开发服务：

```bash
pnpm --filter api db:deploy
pnpm dev
```

## PR 质量门禁工作流

- GitHub Actions 会在 `pull_request` 上运行一条仅面向 PR 的质量工作流。
- 请把 branch protection 配置到以下稳定 job 名称上：
  - `pr-quality / format`
  - `pr-quality / static`
  - `pr-quality / test`
  - `pr-quality / e2e`
- 仅文档 PR 仍然会上报这四个 job，但会以显式 no-op success 收敛，避免 required checks 长时间停留在 pending。
- 代码 PR 会始终运行全量 `pnpm format:check`，并把 `pnpm test:e2e` 作为终局门禁。
- 仅限 `apps/` 局部改动的 PR，会在 static 与单元/集成测试门禁中使用
  `turbo run lint --affected`、`turbo run typecheck --affected` 与
  `turbo run test --affected`。只要触及共享 package、根级配置、workflow
  或 lockfile，就会保守回退到全仓执行。
- 数据库相关的 `pr-quality / test` 与 `pr-quality / e2e` 会在 workflow 内自行拉起 PostgreSQL 18 service container，并在校验前创建临时 CI 数据库。
- 如果要在可信的同仓库 PR 上启用 Turbo remote cache，请在 GitHub Actions
  secrets 中配置 `TURBO_TOKEN` 与 `TURBO_TEAM`。fork PR 和没有这些 secrets
  的自动化 PR 会有意以 uncached 方式运行，而不会削弱质量门禁。
- 这次工作流 rollout 不需要额外的生产监控，因为它只新增 PR 校验，不改变线上运行时行为。
