---
title: 文章内容提取无 HTTP 重试，摘要调度采用 fail-open 设计
date: 2026-04-30
category: integration-issues
module: apps/api article-content
problem_type: integration
component: article_content_extraction
severity: medium
applies_when:
  - 审查 ArticleContentModule 架构
  - 评估文章提取中外部 HTTP 请求的重试行为
  - 评估内容与摘要管道间的错误处理边界
  - 考虑 tryPersistArticleContent 的幂等性保证
tags:
  [
    apps-api,
    article-content,
    retry,
    error-handling,
    fail-open,
    idempotency,
    architectural-review,
  ]
---

# 文章内容提取无 HTTP 重试，摘要调度采用 fail-open 设计

## 背景

`ArticleContentService.tryPersistArticleContent` 编排文章内容提取管道：从原始 URL 抓取 HTML，通过 Readability + Turndown 提取可读内容，将 Markdown 持久化到数据库，然后调度摘要生成。

审查中发现的关键架构观察：

1. **无 HTTP 重试**：`fetchArticleHtml` 单次调用 `fetch()`，配合 `AbortController` 超时。网络错误、超时或非 200 状态码时直接抛异常——无重试循环、无退避、无回退。
2. **Fail-open 摘要调度**：内容持久化后，摘要调度（`articleSummaryService.schedule`）的失败被捕获并记录日志，但不会回滚已持久化的内容。这是有意为之——内容提取代价高（HTTP + DOM 解析），摘要可后续重试。
3. **幂等性隐式重试**：失败的提取使 `contentMarkdown` 在数据库中保持为 null。下次 feed ingestion 循环会对同一篇文章再次调用 `tryPersistArticleContent`，相当于重试。不会立即重试，但会在下次 ingestion 触发时最终重试。

## 模式

**当前设计权衡：**

| 关注点       | 当前行为                        | 权衡                               |
| ------------ | ------------------------------- | ---------------------------------- |
| HTTP 重试    | 无——单次 fetch                  | 简单；避免阻塞批次中的其他文章     |
| 摘要调度失败 | 捕获、记录日志、保留内容        | 内容提取代价高；摘要代价低且可重试 |
| 失败重试     | 通过下次 ingestion 循环隐式重试 | 延迟但有保证（只要 feed 持续更新） |
| 超时预算     | 调用方传入，限制在 [1ms, 10s]   | 防止 fetch 失控；防止零/负超时     |

**应该做：**

- 接受单次 fetch 对此 ingestion 模型是正确的——文章在批处理循环（`FeedIngestionService.enrichArticles`）中处理，重试一篇文章会阻塞其余文章。
- 依赖幂等性：`contentMarkdown === null` 检查确保失败的提取在下次 ingestion 循环中重试。
- 对摘要调度保持 fail-open——内容持久化是已完成的昂贵操作，摘要在下游且可重试。

**不应该做：**

- 在 `tryPersistArticleContent` 内部添加重试循环而不考虑批处理吞吐量——一次慢重试会阻塞所有剩余文章。
- 摘要调度失败时回滚内容持久化——这会浪费已完成的昂贵提取。
- 将 `status: "failed"` 视为终态——它的意思是"本次周期未完成"，不是"永远失败"。

## 相关代码

```ts
// 单次 fetch + 超时——无重试
private async fetchArticleHtml(originalUrl: string, timeoutMs = ARTICLE_FETCH_TIMEOUT_MS) {
  const effectiveTimeoutMs = Math.max(1, Math.min(timeoutMs, ARTICLE_FETCH_TIMEOUT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  try {
    const response = await fetch(originalUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`Article request failed with status ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

// Fail-open：摘要调度失败不影响 succeeded 状态
try {
  this.articleSummaryService.schedule(articleId, "content_persisted");
} catch (error) {
  this.logger.warn(...); // 记录日志并继续——内容已持久化
}
```

## 为什么重要

- 理解重试模型可防止错误假设——`failed` 不代表文章永久丢失，而是代表下次 feed ingestion 时会再次尝试提取。
- Fail-open 摘要调度是有意的架构边界：内容和摘要是具有不同成本特征的独立关注点。
- 批处理模型意味着重试必须延迟而非内联——这是有意识的设计选择，不是遗漏。
