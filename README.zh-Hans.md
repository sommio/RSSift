# RSSift

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-Hans.md">中文</a>
</p>

RSSift 是一个基于 Turborepo 的 AI 辅助 RSS 筛选工具单仓库。
它的目标是拉取 feed、生成摘要、提供双栏桌面视图，并在需要时跳转原文。

## 当前状态

- 项目目前处于敏捷、迭代式开发中。
- 已完成第一条端到端切片，作为当前可工作的切片。
- `apps/api` 提供基于 fixture 的文章列表和详情接口。
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

1. 安装依赖：

```bash
pnpm install
```

2. 在一个终端启动 API：

```bash
pnpm --filter api dev
```

3. 如果 `apps/web/.env.local` 不存在，请创建它，并配置 API 地址：

```bash
API_BASE_URL=http://127.0.0.1:3000
```

4. 在另一个终端启动 Web 应用：

```bash
pnpm --filter web dev
```

本地默认地址如下：

- API: `http://127.0.0.1:3000`
- Web: `http://127.0.0.1:3001`

## 常用命令

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
```
