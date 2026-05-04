---
title: Article summary 调度必须支持自动补扫，以恢复漏掉的任务
date: 2026-05-04
category: workflow-issues
module: article summary
problem_type: workflow_gap
component: background_job
symptoms:
  - summary job 只有在上游代码显式调用 `ArticleSummaryService.schedule()` 时才会进入队列
  - 启动时的 backfill 只会覆盖 bootstrap 当下查到的候选集，运行期漏掉的文章不会之后自动再扫到
  - ingestion 或 title-change 路径里的瞬时漏触发，会让文章一直没有 summary，直到下一次手动或启动触发出现
root_cause: workflow_gap
resolution_type: design_update
severity: medium
related_components:
  - nest_service
  - repository
  - bootstrap
  - scheduler
tags:
  [
    article-summary,
    backfill,
    schedule,
    bootstrap_backfill,
    automatic-scan,
    background-job,
    fail-open,
  ]
---

# Article summary 调度必须支持自动补扫，以恢复漏掉的任务

## Problem

当前 article summary 流水线是事件驱动的。`ArticleSummaryService.schedule()` 只有在别的代码路径显式调用时才会入队，而 `ArticleSummaryBootstrapService` 只会在启动时做一次性 bootstrap backfill。这意味着系统不会持续重新扫描数据库里“应该有 summary 但还没收到调度事件”的文章。

## Review Note

review 意见指出了一个后续需求：系统需要自动补扫。也就是说，如果想让漏掉的任务在没有人工介入的情况下自己恢复，summary pipeline 不能只依赖启动时发现和零散事件触发。

## 症状

- 文章已经持久化了内容，但如果 `content_persisted` 或 `title_changed` 触发漏了，就可能一直没有 summary。
- 进程重启或临时故障窗口里错过的文章，不会在之后自动被重新发现，除非又碰到一次 bootstrap 或手动触发。
- 当前内存队列只代表“这个进程里已经调度过的任务”，不会从 durable state 里把漏掉的工作重建出来。

## What Did Not Work

- 把 `schedule()` 当成唯一入口，runtime flow 虽然简单，但会留下 recovery gap。
- 只做 bootstrap backfill 只能解决冷启动恢复，关不掉启动后的漏扫窗口。
- 依赖上游调用方记住所有触发点太脆，任何漏事件都会变成静默的 summary starvation。

## Solution

增加一个持久化的自动补扫路径，周期性查询 repository 里还没完成摘要的候选文章，并重新提交到 `ArticleSummaryService.schedule()`。

这个扫描任务应该：

- 读 durable database state，不读 in-memory queue state
- 调度前先和当前 tracked jobs 去重
- 只处理仍然需要 summary work 的文章，保持 fail-open 语义
- 以受控频率运行，让漏掉的任务最终能自动恢复，不依赖人工重新跑 bootstrap

一个更清晰的职责拆分是：

- `ArticleSummaryBootstrapService`：启动时的一次性补偿
- `ArticleSummaryScanService` 或等价 scheduler：周期性数据库补扫
- `ArticleSummaryService`：只负责内存执行和 retry 机制

## Why This Works

这个方案把现在混在一起的三件事拆开了：

- database discovery 负责告诉系统缺什么
- scheduling 决定什么进入当前进程队列
- execution 负责 retry、logging 和 persistence

有了周期性 scan，系统就能从漏触发、进程重启和临时 runtime gap 里恢复，而不需要 operator 手动再跑 bootstrap 逻辑。

## Prevention

- 任何依赖显式触发的 background job，只要允许漏事件，就应该同时定义 durable recovery scan。
- 把 bootstrap recovery 和 recurring backfill 分开，避免 startup 逻辑变成唯一安全网。
- 把 in-memory queue 当成 execution cache，不要当成 work discovery 的 source of truth。
- review 如果要求自动恢复，优先做 durable scan，不要把 `schedule()` 的职责越扩越大。

## Related Context

- `apps/api/src/article-summary/article-summary.service.ts`
- `apps/api/src/article-summary/article-summary-bootstrap.service.ts`
- `docs/en/solutions/logic-errors/article-summary-retryable-failures-must-not-clear-existing-summary-2026-04-18.md`
- `docs/zh-Hans/solutions/logic-errors/article-summary-retryable-failures-must-not-clear-existing-summary-2026-04-18.md`
- `docs/en/solutions/integration-issues/feed-ingestion-retries-missing-article-markdown-2026-04-17.md`
- `docs/zh-Hans/solutions/integration-issues/feed-ingestion-retries-missing-article-markdown-2026-04-17.md`
