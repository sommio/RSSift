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
- `apps/api` 现在也会在 ingestion 期间以 best-effort 方式尝试抽取并落库文章正文 Markdown，为后续摘要能力准备输入层。
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
cp apps/api/feeds.opml.example apps/api/feeds.opml
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

仓库根目录的 `.env` 与 `compose.yaml` 不属于本地 app 开发路径。
它们是面向运维者的 Docker Compose 自托管部署入口。

## VPS 自托管部署

仓库根目录的 `compose.yaml`、根 `.env` 与根 `Caddyfile` 就是生产部署面。
这次刻意把入口放在 repo 根，而不是 `deploy/` 子目录里，目的是让运维者在
clone 仓库后，一眼就能看到入口，并直接从根目录拉起整栈。

### 前置条件

- VPS 已安装 Docker Engine 与 Compose plugin
- 运维者自己拥有并备份的宿主机 OPML 文件路径
- 宿主机已放通 Caddy 对外发布的端口
- 如果希望由 Caddy 自动签发 HTTPS，需要可访问的公网域名

### 准备运维输入

1. 先复制根部署环境文件：

```bash
cp .env.example .env
```

2. 编辑根 `.env`：

- `CADDY_SITE_ADDRESS`
  - 本地 Docker 验证可用 `http://localhost`
  - VPS 上若希望 Caddy 自动 HTTPS，请填裸域名，例如 `rss.example.com`
- `HTTP_PORT` / `HTTPS_PORT` 控制 Caddy 对宿主机发布的端口
- `POSTGRES_*` 拥有 Compose 管理的 PostgreSQL 凭据与数据库名
- `FEED_OPML_HOST_PATH` 必须指向一个已存在的宿主机文件路径；Compose 会把它
  以只读 bind mount 的方式挂进 API 容器
- `INGEST_ON_BOOT` 与 `LLM_*` 仍然是显式的 operator-owned API 运行时输入

### 构建并启动整栈

```bash
docker compose up -d --build
```

这个根栈会启动：

- 仅在 Compose 内网可达的 `postgres`
- 负责一次性 Prisma 迁移门禁的 `api-migrate`
- 单进程运行的 Nest 服务 `api`
- 通过 `API_BASE_URL=http://api:3000` 访问 API 的 Next.js 服务 `web`
- 作为唯一公网入口的 `caddy`

### 部署后验证

```bash
docker compose ps
docker compose logs --tail=100 api-migrate api web caddy
curl http://127.0.0.1:${HTTP_PORT:-80}/
curl http://127.0.0.1:${HTTP_PORT:-80}/api/health
docker compose exec api node -e "fetch('http://127.0.0.1:3000/health/ready').then((response) => response.text().then((body) => { console.log(response.status, body); process.exit(response.ok ? 0 : 1); })).catch((error) => { console.error(error); process.exit(1); })"
```

健康预期：

- `api-migrate` 一次性成功退出
- `api` 的 `/health/live` 与 `/health/ready` 返回 `200`
- `web` 的 `/api/health` 返回 `200`
- 外部流量先到 `caddy`，再只反代到 `web`

这条首版部署路径的显式运维规则：

- PostgreSQL 默认保持 Compose 内网私有
- 只有 Caddy 会向宿主机发布端口
- API 仍然是单进程部署目标
- `feeds.opml` 始终由运维者在宿主机持有，不会被烘焙进镜像
- 根 `.env` 只服务部署；`apps/api` 与 `apps/web` 各自的 `.env.local`
  继续是本地开发入口

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

文章正文落库现在属于正常 ingestion 生命周期，而不是手工脚本。如果某一篇已
持久化文章需要补救性重跑，可以调用这个狭窄接口：

```bash
curl -X POST http://127.0.0.1:3000/article-content/<article-id>/retry
```

这个接口只是 repair path，不是默认工作流。本切片里公开的文章读取 API 仍
然不会暴露已存储的 Markdown。

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
