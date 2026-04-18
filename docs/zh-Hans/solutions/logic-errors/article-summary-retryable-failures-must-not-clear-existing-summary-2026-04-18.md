---
title: Retryable article summary failure 在重试耗尽前不能清空已有可读摘要
date: 2026-04-18
category: logic-errors
module: article summary
problem_type: logic_error
component: background_job
symptoms:
  - 可重试的 `title_changed` 摘要刷新在第一次瞬时 gateway 失败后，就可能把原本可读的 prepared summary 变成 error 或 pending 状态
  - 即使后续重试仍会继续，`summaryErrorReason` 也会被过早持久化，让瞬时失败看起来像 terminal failure
  - 在把 refresh path 单独测出来之前，单元测试允许 retryable failure 过早落库
root_cause: logic_error
resolution_type: code_fix
severity: high
related_components:
  - nest_service
  - api_contract
tags:
  [
    article-summary,
    retry,
    fail-open,
    title-changed,
    llm,
    background-job,
    summaryerrorreason,
  ]
---

# Retryable article summary failure 在重试耗尽前不能清空已有可读摘要

## Problem

LLM 摘要流水线本来就有“瞬时 provider 失败可以自动重试”的设计，但第一版实现会在每次 retryable failure 上都先持久化 failure state。对 `title_changed` 刷新任务来说，这意味着哪怕只是一次临时 gateway timeout，reader 里原本还能读的 summary 也会先消失，尽管任务后面还有重试机会。

## Symptoms

- 一篇已经有 `summary` 和 `translatedTitle` 的文章，会在一次 retryable refresh failure 后，临时退化成展示 `summaryErrorReason` 或 `Summary pending`。
- summary service 会在第 1 次尝试时就记录失败并持久化 `summaryErrorReason`，即使第 2、3 次尝试还在队列里。
- review 与 handoff 都把它标成新 `article-summary` 切片里的 P1 fail-open 回归。

## What Didn't Work

- 把每个 `retryable_failed` 结果都立刻持久化 failure state，看起来和 terminal failure 处理一致，但它破坏了 enrichment job 的 fail-open 契约。
- 先去改 repository 语义会比实际需要更大；真正的 bug 是 service 在检查“是否还有剩余重试”之前，就调用了 `saveSummaryFailure()`。
- 现有测试覆盖了“重试最终耗尽”，却没有覆盖更强的要求：中间态的 retryable failure 不应该改变已经持久化、用户可见的状态。

## Solution

把 `ArticleSummaryService.runJob()` 里的 failure persistence 移到“最后一次尝试失败”之后。现在 retryable failure 会一直停留在内存重试流程里，直到第 3 次仍然失败，才真正持久化 `summaryErrorReason` 并清空 prepared summary 字段。

修复前：

```ts
if (result.status === "retryable_failed") {
  await this.persistFailureState(job, result.reason, true);

  if (job.attempt >= ARTICLE_SUMMARY_MAX_ATTEMPTS) {
    this.trackedArticleIds.delete(job.articleId);
    return;
  }

  setTimeout(() => {
    this.queue.push({
      ...job,
      attempt: job.attempt + 1,
    });
    this.drainQueue();
  }, ARTICLE_SUMMARY_RETRY_DELAY_MS);

  return;
}
```

修复后：

```ts
if (result.status === "retryable_failed") {
  if (job.attempt >= ARTICLE_SUMMARY_MAX_ATTEMPTS) {
    await this.persistFailureState(job, result.reason, true);
    this.trackedArticleIds.delete(job.articleId);
    return;
  }

  this.logger.warn(
    JSON.stringify({
      articleId: job.articleId,
      attempt: job.attempt,
      reason: result.reason,
      retryable: true,
      scope: "article_summary",
      status: "scheduled_retry",
      trigger: job.reason,
    }),
  );

  setTimeout(() => {
    this.queue.push({
      ...job,
      attempt: job.attempt + 1,
    });
    this.drainQueue();
  }, ARTICLE_SUMMARY_RETRY_DELAY_MS);

  return;
}
```

这个修复也被针对性测试锁住了：前两次尝试都不能落库，第 3 次才允许持久化；同时还补了 `title_changed` refresh path 的显式覆盖：

```ts
service.schedule("article-1", "title_changed");
await flushJobs();
expect(repository.saveSummaryFailure).not.toHaveBeenCalled();

await jest.advanceTimersByTimeAsync(60_000);
expect(repository.saveSummaryFailure).not.toHaveBeenCalled();

await jest.advanceTimersByTimeAsync(60_000);
expect(repository.saveSummaryFailure).toHaveBeenCalledTimes(1);
```

## Why This Works

`ArticleSummaryRepository.saveSummaryFailure()` 在持久化 `summaryErrorReason` 时，会同时把 `summary` 和 `translatedTitle` 清空。这个写入只有在系统已经确定“这是 terminal failure”时才是对的。把这一步延后到重试耗尽之后，系统就能在瞬时失败期间保住最后一次成功的 reader 内容；如果最终还是失败，再落一条 durable failure reason 也仍然成立。

这恢复了 background enrichment 应有的 fail-open 语义：

- 临时 provider failure 不会立刻降级 reader 可见内容
- retry 调度仍然能通过日志观察到
- terminal failure 的最终语义不变

## Prevention

- 只要 background job 会写用户可见 fallback state，就给“中间重试”和“最终耗尽”两条路径都补测试。
- 把会清空成功数据的 repository 方法视为状态转换边界；调用方只能在最终决策后调用，不能在试探性的 retry 过程中调用。
- 对已经发布过内容的 refresh path，优先保留 stale-but-usable 的旧内容，直到新内容成功生成，或重试策略真正耗尽。
- 保持计划文档与已上线 fallback contract 同步，这样 review 才能拿正确的 fail-open 预期做对照。

## Related Issues

- 相关、重叠中等：`docs/en/solutions/integration-issues/feed-ingestion-retries-missing-article-markdown-2026-04-17.md` + `docs/zh-Hans/solutions/integration-issues/feed-ingestion-retries-missing-article-markdown-2026-04-17.md` — 同属 fail-open ingestion/enrichment 区域，但根因和恢复路径不同
- 相关交接：`.claude/handoffs/2026-04-18-215811-llm-summary-reader-p1-fix.md`
- 相关 review 上下文：`.claude/handoffs/2026-04-18-221336-review-llm-summary-reader.md`
- 计划上下文：`docs/en/plans/2026-04-18-001-feat-v0-1-llm-summary-reader-plan.md` + `docs/zh-Hans/plans/2026-04-18-001-feat-v0-1-llm-summary-reader-plan.md`
- GitHub issue 搜索已跳过：`gh issue list` 返回 `401 Unauthorized`
