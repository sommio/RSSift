# 贡献指南

## 项目范围

本仓库采用 Turborepo monorepo 结构，包含以下部分：

- `apps/api`：NestJS API，负责 Feed 拉取、Prisma 数据持久化、摘要生成
- `apps/web`：Next.js Web 阅读器
- `packages/*`：共享 UI 组件和共享配置包

应用代码统一放在 `apps/`，共享代码和配置统一放在 `packages/`。

## 环境要求

- Node.js `24.14.1` 或更高版本
- pnpm `10.33.0` 或更高版本
- 本地 PostgreSQL 18，用于开发和测试

默认本地数据库连接：

- `postgresql://rssift:rssift@127.0.0.1:5432/rssift`
- `postgresql://rssift:rssift@127.0.0.1:5432/rssift_test`：用于本地 e2e 测试和测试运行

## 首次初始化

```bash
git clone https://github.com/sommio/RSSift
cd RSSift
pnpm install
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
cp apps/api/feeds.opml.example apps/api/feeds.opml
pnpm --filter api db:deploy
```

如果需要示例数据，可以运行：

```bash
pnpm --filter api db:seed
```

## 本地开发

启动整个 workspace：

```bash
pnpm dev
```

也可以分别启动两个应用：

```bash
pnpm --filter api dev
pnpm --filter web dev
```

本地默认地址：

- API：`http://127.0.0.1:3000`
- Web：`http://127.0.0.1:3001`

如果数据库 schema 落后于迁移历史，先执行：

```bash
pnpm --filter api db:deploy
```

## 质量门禁

`pnpm install` 会通过 Husky 自动安装本地 Git hooks：

- `pre-commit`：`pnpm lint:staged`
- `pre-push`：`pnpm typecheck`

常用检查命令：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

## Package 命令

API / Prisma 常用命令：

```bash
pnpm --filter api db:generate
pnpm --filter api db:migrate
pnpm --filter api db:deploy
pnpm --filter api db:reset
pnpm --filter api db:seed
pnpm --filter api db:studio
```

## AI 工作流

我们采用了 Every 提出的复合工程（Compound Engineering）工作流，并将其实现为可主动调用的 skills。日常开发遵循以下路径：

`ce:brainstorm -> ce:plan -> ce:work -> ce:review -> ce:compound`

如果问题本身还不够清晰，先用 `ce:ideate` 来梳理方向。

具体来说：

- 需求模糊时，先用 `ce:brainstorm` 发散思路
- 方向明确后，用 `ce:plan` 把工作拆解清楚，再动手
- 开始实现时，用 `ce:work` 按计划执行，而不是对着模糊描述直接写代码
- 完成后用 `ce:review` 重点检查 bug、回归、架构问题和遗漏的测试
- 确认有价值的内容后，用 `ce:compound` 将经验沉淀回仓库，供后续使用

这些 skills 可以主动调用，不需要等用户点名才使用。

参考资料：

- 插件仓库：[EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin)
- 文章：[Compound Engineering: How Every Codes With Agents](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents)

## 文档规则

所有持久化文档必须保持中英文双语同步维护：

- 英文文档：`docs/en/`
- 简体中文文档：`docs/zh-Hans/`

每次修改时，需要在同一轮改动中同步更新两个语言版本。
