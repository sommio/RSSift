---
title: Prisma 入口 schema 不应承载文章 identity enum
date: 2026-04-27
category: integration-issues
module: prisma schema organization
problem_type: integration_issue
component: prisma_schema
symptoms:
  - `apps/api/prisma/schema.prisma` 定义了 `IdentitySourceType`，但这个 enum 只被 `Article` 使用
  - 入口 schema 把 generator / datasource 配置和领域自有类型混在一起，导致 root 文件不再只是薄薄的 bootstrap 层
  - 以后只要改文章 identity 语义，就必须改入口 schema，虽然这个 ownership 明明属于 article 模型文件
root_cause: boundary_leak
resolution_type: code_fix
severity: medium
related_components:
  - database
  - schema_directory
tags:
  [
    prisma,
    schema-organization,
    models-directory,
    enum,
    architecture-boundary,
    article-identity,
  ]
---

# Prisma 入口 schema 不应承载文章 identity enum

## Problem

`apps/api/prisma/schema.prisma` 当前像一个 root entry file，但里面却放了 `enum IdentitySourceType { SOURCE_ID CANONICAL_URL CONTENT_SIGNATURE }`。这个 enum 实际上只被 `apps/api/prisma/models/article.prisma` 里的 `Article` 使用，所以 root schema 正在持有本应归 article model 所有的领域状态。

这个放置方式破坏了预期边界，具体有两层：

- root schema 不再只是 generator / datasource 的薄 bootstrap 层
- article identity 语义被拆散在入口文件和真正使用它的 model 文件之间

## Symptoms

- enum 放在入口 schema，而不是放在引用它的 `Article` model 旁边。
- root 文件开始像一个装杂项领域类型的垃圾桶，而不是专注 schema bootstrap。
- 读 review 的人必须先看入口 schema，才能理解 article identity，虽然真正的 ownership boundary 明明在 article model 文件。

## What Didn't Work

- 因为 Prisma “全局可见”就把 enum 留在 `schema.prisma`，只是把 ownership 问题藏起来了；可见性不等于责任归属。
- 把 root schema 当成放“小类型”的方便位置，会鼓励更多 drift，尤其当别的 model 也开始照抄这个模式时。
- 把 enum 留在和 model 分离的位置，会让 article schema 更难读，也更难随着 identity 规则演进。

## Solution

把 `IdentitySourceType` 移到 `apps/api/prisma/models/article.prisma`，和 `Article` 放在同一个 ownership boundary 里；`apps/api/prisma/schema.prisma` 只保留共享的入口职责，比如 generator 和 datasource wiring。

ownership 规则很简单：

- 如果只有一个 model 用到这个类型，就把它定义在那个 model 文件里
- 如果某个类型以后真的变成共享类型，就显式放到 `apps/api/prisma/models/` 里的共享文件，不要塞回 root entry schema

这样 article identity 的规则就会紧贴 `Article` model，而 root schema 也能继续保持成薄 bootstrap surface。

## Why This Works

这个仓库本来就把 `apps/api/prisma/models/` 当作领域拆分文件的放置点。`Article` 已经自己拥有 `identityHash`、`identitySourceType`、`identitySourceValue` 和 `sourceId`，所以这个 enum 也应该属于同一个 ownership boundary。

这种布局也更稳：

- model-local enum 更容易发现
- entry schema 更稳定
- 以后 article identity 的变化不会泄漏到无关的 schema bootstrap 代码里

## Prevention

- 保持 `schema.prisma` 足够薄：只放 generator、datasource 和共享 bootstrap 关注点。
- enum 默认贴着它的语义 owner 放，只有在确实共享时才抽出来。
- 检查 schema ownership 时先看 `apps/api/prisma/models/`，不要把 root schema 当作领域类型的默认家。
- 如果一个类型先属于单个 model，后面才扩散到多个地方，再有意识地抽成共享定义。

## Related Issues

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/models/article.prisma`
- `apps/api/prisma/migrations/202604150001_init_feed_ingestion/migration.sql`
- `docs/en/plans/2026-04-15-001-feat-feed-ingestion-backbone-plan.md`
- `docs/zh-Hans/plans/2026-04-15-001-feat-feed-ingestion-backbone-plan.md`
