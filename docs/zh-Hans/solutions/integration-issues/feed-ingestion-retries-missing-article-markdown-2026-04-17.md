---
title: Feed ingestion 必须为仍然缺失正文的既有文章重新触发 Markdown 富化
date: 2026-04-17
category: integration-issues
module: feed ingestion
problem_type: integration_issue
component: nest_service
symptoms:
  - 多次 ingestion 运行会更新文章元数据，但同一条记录上的 `contentMarkdown` 仍然保持 null
  - 缺失正文的恢复依赖次级 retry 接口，而不是正常 ingestion 主路径
  - 单元测试曾允许“只给新建记录触发 article-content 富化”的回归通过
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - typeorm_repository
tags:
  [
    feed-ingestion,
    article-content,
    markdown,
    retry,
    contentmarkdown,
    fail-open,
    nestjs,
  ]
---

# Feed ingestion 必须为仍然缺失正文的既有文章重新触发 Markdown 富化

## Problem

文章 Markdown 切片的预期是：在正常 feed ingestion 期间自动完成正文富化，同时保持 ingestion fail-open。这个契约后来发生了回归：如果第一次正文抽取失败，后续 ingestion 虽然会更新已有文章行，但不会再把它重新送去做 Markdown 抽取，导致 `contentMarkdown` 会一直保持 null，除非操作者手动调用 retry 接口。

## Symptoms

- 第一次 ingestion 运行在文章 HTML 抓取/抽取失败后，仍然会成功落下文章元数据，但 `contentMarkdown` 与 `contentExtractedAt` 仍为 null。
- 同一个 feed 后续再次 ingestion 时，会保留原来的文章行并刷新元数据，但不会自动补回缺失的 Markdown。
- 单篇 retry 接口本身是可用的，这让问题很容易被误读成“只能手动补救也算合理”，而忽略了主路径其实已经坏掉。

## What Didn't Work

- 把 article-content 富化收窄成“只处理新建记录”看起来很安全，但它悄悄破坏了历史文章的恢复路径：这些文章早已被发现，只是正文抽取尚未成功。
- 依赖单篇 retry 接口并不够，因为本切片的 plan 明确把 retry 定义为次级补救路径，而不是正文落库的主契约。
- 之前的一个单元测试实际上把错误行为锁定了下来，所以这个回归可以在 review 中漏过去，直到补上跨两次运行的端到端恢复场景才暴露出来。

## Solution

在 `FeedIngestionService.persistNormalizedArticles()` 里恢复这条编排规则：对于已经存在但正文仍缺失的文章行，要重新加入富化队列；而对已经有正文的文章，仍然跳过。

修复前：

```ts
if (existing) {
  await tx.article.update({
    where: { id: existing.id },
    data: {
      title: article.title,
      originalUrl: article.originalUrl,
      publishedAt: article.publishedAt,
      summary: article.summary,
      ingestedAt: article.ingestedAt,
      sourceId: existing.sourceId ?? article.sourceId,
    },
  });
  continue;
}
```

修复后：

```ts
if (existing) {
  await tx.article.update({
    where: { id: existing.id },
    data: {
      title: article.title,
      originalUrl: article.originalUrl,
      publishedAt: article.publishedAt,
      summary: article.summary,
      ingestedAt: article.ingestedAt,
      sourceId: existing.sourceId ?? article.sourceId,
    },
  });

  if (!existing.contentMarkdown) {
    articleIds.push(existing.id);
  }

  continue;
}
```

围绕这条编排规则补了两层回归保护：

1. `apps/api/src/feeds/feed-ingestion.service.spec.ts` 新增单元测试，断言 `contentMarkdown: null` 的既有文章会再次经过 `tryPersistArticleContent(...)`。
2. `apps/api/e2e/feed-ingestion.e2e-spec.ts` 新增端到端测试，验证完整恢复链路：第一次运行 fail-open，第二次运行沿用同一条文章记录，并在那次后续 ingestion 中自动补写 Markdown。

下游 `ArticleContentService` 的幂等契约保持不变：

```ts
if (article.contentMarkdown && !options?.force) {
  return {
    reason: "already_extracted",
    status: "skipped",
  };
}
```

这道保护让恢复后的重新入队对“已经有正文”的记录依然是安全的。

## Why This Works

问题出在 feed 元数据持久化与 article-content 富化之间的集成边界。ingestion 流水线本来已经具备这些能力：

- 跨多次运行保持文章 identity 稳定，
- 对既有文章行更新元数据，
- 对已存在正文的文章避免重复抽取。

真正丢失的是：这些“已经存在但仍不完整”的文章，没有再被重新接回富化步骤。现在只对 `contentMarkdown` 缺失的记录重新入队，就能恢复预期中的自动补救路径，同时又不会让每次重复 ingestion 都触发冗余抽取。`ArticleContentService` 里的幂等检查仍然是第二道保险，所以已经完成富化的记录还是会被干净地短路跳过。

## Prevention

- 给“existing row”两种分支都保留编排测试：一种是 `contentMarkdown: null`，另一种是已经有 Markdown。
- 保留至少跨两次 ingestion 的 e2e 场景，因为这个回归只有在第一次 fail-open、第二次尝试恢复时才会显现。
- 在测试和文档里把 repair endpoint 明确当作次级流程；如果主契约写的是自动富化，就要直接断言这条主路径。
- 只要 `findFirst()` 的结果参与后续编排决策，就要把决策所需字段视为契约的一部分。这里的 `existing.contentMarkdown` 就是这样，不应随意从查询/结果形状里拿掉。

## Related Issues

- `apps/api/src/feeds/feed-ingestion.service.ts`
- `apps/api/src/feeds/feed-ingestion.service.spec.ts`
- `apps/api/e2e/feed-ingestion.e2e-spec.ts`
- `apps/api/src/article-content/article-content.service.ts`
- `apps/api/e2e/article-content-retry.e2e-spec.ts`
- `docs/en/plans/2026-04-17-001-feat-article-markdown-backfill-plan.md`
- `docs/zh-Hans/plans/2026-04-17-001-feat-article-markdown-backfill-plan.md`
- `.claude/handoffs/2026-04-17-164836-feed-ingestion-auto-enrichment-recovery.md`
- `.claude/handoffs/2026-04-17-170512-article-markdown-backfill-review-fix.md`
