---
title: feed 模块应拆开解析、持久化和编排
date: 2026-04-28
category: developer-experience
module: apps/api feeds
problem_type: developer_experience
component: feature_module_design
severity: medium
applies_when:
  - 审查 `apps/api/src/feeds` 的可维护性或简化方式时
  - `feed-ingestion.service.ts` 把拉取、归一化、持久化和后续工作混在一起时
  - bootstrap 和 wake-resume 逻辑只是包了一层很薄的 ingestion 服务时
  - 虽然已经有 helper 文件，但整个模块仍然很难从头读顺
tags:
  [
    apps-api,
    feeds,
    nestjs,
    feature-modules,
    maintainability,
    simplification,
    developer-experience,
  ]
---

# feed 模块应拆开解析、持久化和编排

## Context

`apps/api/src/feeds` 能跑，但这个模块现在承担的事情太多了。

当前形态把几类不同职责放在了一起：

- 读取 OPML 和提取订阅列表
- feed 请求、超时和重试处理
- feed 条目归一化和排序
- article upsert 逻辑
- 后续内容抽取
- summary refresh 调度
- bootstrap 和 wake-resume 编排

这让 `feed-ingestion.service.ts` 很难扫。它不只是“一个 service 加几个
helper”，而是一个小型 ingestion 系统的中心。

文件拆分已经有雏形，但代码读起来仍像一条很长的 pipeline，中间还夹了
不少副作用。

## Guidance

更好的形态应该更窄：

- 保留一个小的 orchestration 层，只管 ingestion 流程
- 把纯粹的 feed 解析 / 归一化 helper 放进独立的 utility 或 mapper
  文件
- 把持久化决策抽到单独的 repository 风格类或 persistence helper
- 让 bootstrap 和 wake-resume 只做很薄的生命周期适配
- 把下游内容抽取 / summary refresh 变成显式步骤，不要藏在主循环里

重点不是为了多拆几个文件，而是让每一步都能被清楚命名：

- “读订阅”
- “抓取并解析单个 feed”
- “归一化条目”
- “持久化文章变更”
- “触发后续工作”

如果读者能沿着这些动词理解模块，这个代码就顺多了。

## Why This Matters

现在这套结构会在三个地方增加心智负担：

1. **阅读**：ingestion service 太长，必须同时记住太多状态。
2. **修改**：一次改动很容易同时碰到抓取、归一化、持久化和日志。
3. **审查**：review 讨论会变成“该放哪儿”，而不是行为本身有没有变。

这不是单纯审美问题，是 developer experience 问题。

这个模块以后也很容易继续长胖，因为新的 feed 侧行为很容易继续往同一
个文件里堆。

## 具体发现: `persistNormalizedArticles`

审查 `feed-ingestion.service.ts:386-476` 发现以下具体违规：

### 1. 缺少 Repository 层

其他 feature module（`articles/`、`article-content/`、`article-summary/`）都用
独立 repository 类封装 Prisma 调用。`FeedIngestionService` 直接调
`this.prisma`，违反已建立的分层模式。

应有 `FeedIngestionRepository` 封装 feeds 模块所有 Prisma 操作。

### 2. N+1 查询 (find-then-create/update)

第 417-468 行：对每篇归一化文章，事务内执行 `findFirst` 来决定 create 还是
update。文章数量多时产生 O(N) 次查询，一次 `upsert` 或 batch 操作即可。

### 3. OR filter 构造脆弱

第 420-427 行：

```typescript
OR: [
  article.sourceId ? { sourceId: article.sourceId } : undefined,
  article.originalUrl ? { originalUrl: article.originalUrl } : undefined,
  { identityHash: article.identityHash },
].filter(Boolean) as Array<Record<string, unknown>>,
```

`.filter(Boolean) as Array<...>` 类型断言隐藏了 OR 数组可能为空的情况，
依赖运行时 truthiness 而非类型安全的查询构建。repository 方法配合显式
upsert 逻辑可消除此问题。

### 4. 单事务混合关注点

方法在同一 `$transaction` 里同时 upsert feed 记录和持久化所有文章。语义上
这两件事是分开的：feed 元数据更新不应阻塞或回滚 article 持久化。拆成
feed repository 方法和 article repository 方法可让各自独立测试和组合。

## When to Apply

- 当 `apps/api/src/feeds/feed-ingestion.service.ts` 已经像一个小应用，而不
  像一个普通 service
- 当 review 反复出现“这里一文件塞太多东西了”
- 当新增 feed 行为只会让主 service 更长，而不是更清楚
- 当 bootstrap、auto-refresh、ingestion 逻辑开始互相缠在一起

## Related

- `apps/api/src/feeds/feed-ingestion.service.ts`
- `apps/api/src/feeds/feed-ingestion.parsers.ts`
- `apps/api/src/feeds/feed-bootstrap.service.ts`
- `apps/api/src/feeds/feed-auto-refresh.service.ts`
- `apps/api/src/feeds/feed-auto-refresh.repository.ts`
- `docs/en/solutions/developer-experience/feed-module-should-split-parsing-persistence-and-orchestration-2026-04-28.md`
