---
title: 唤醒触发的 feed 自动刷新必须复用 canonical ingestion 流水线与持久成功状态
date: 2026-04-20
category: integration-issues
module: feed auto refresh
problem_type: integration_issue
component: nest_service
symptoms:
  - 同一 Node 进程在休眠或 freeze 后恢复时，feed 数据可能继续陈旧，因为 `INGEST_ON_BOOT` 只覆盖冷启动
  - API 之前没有持久化的全局“上次唤醒刷新成功时间”，因此基于间隔的 gate 没有权威来源
  - 如果唤醒刷新绕开 `FeedIngestionService`，就很容易与现有 article-content 与 summary 流水线发生漂移
root_cause: missing_workflow_step
resolution_type: code_fix
severity: medium
related_components:
  - background_job
  - typeorm_repository
  - typeorm_migration
tags:
  [
    feed-auto-refresh,
    wake-resume,
    feed-ingestion,
    bootstrap,
    prisma,
    summary-pipeline,
    nestjs,
  ]
---

# 唤醒触发的 feed 自动刷新必须复用 canonical ingestion 流水线与持久成功状态

## Problem

`apps/api` 之前只能在 bootstrap 阶段做 feed ingestion，所以它本质上仍是“启动时跑一次”的路径。同一个 Node 进程如果在机器休眠或 runtime freeze 之后恢复，feed 仍可能保持陈旧，而且系统也没有一个持久化的全局成功时间戳来判断“现在是否已经到了该补跑一次后台刷新”的时机。

这个修复必须同时满足几件事：不能阻塞 HTTP 可用性；不能改变 `INGEST_ON_BOOT` 现有含义；新发现的文章仍要继续流入既有的 article-content 与 LLM summary 链路，而不是再造一条独立的 ingestion 路径。

## Symptoms

- 同进程唤醒/恢复没有专门的刷新触发点，所以数据新鲜度仍然依赖下一次冷启动或人工干预。
- 没有单一持久化的 `lastSuccessfulAutoRefreshAt` 作为间隔判断依据；如果把它塞到 `Feed` 行上，会把“全局决策”错误地变成含糊的“每个 feed 自己的状态”。
- 现有 ingestion 路径已经拥有持久化、Markdown 富化和 summary 调度能力，因此再写一套平行的唤醒刷新循环，很快就会和主契约漂移。

## What Didn't Work

- 直接把 `INGEST_ON_BOOT` 当成唤醒刷新开关不行，因为它会混淆两个不同语义：无条件 bootstrap ingestion 与同进程恢复后的按间隔刷新。
- 把唤醒刷新 eligibility 挂到请求路径上也不行，因为需求明确要求不要把 feed/network 工作耦合到读请求。
- 把“上次唤醒刷新成功时间”设计成 per-feed 状态也不合适。这个切片需要的是一个全局时间戳，而不是把同一个概念复制到每条 `Feed` 记录上。

## Solution

这次实现把变更拆成了 `apps/api` 内部的三个联动部分。

1. 增加专用的持久化单例状态模型，以及带默认值的间隔配置：

```prisma
model FeedAutoRefreshState {
  id                          String   @id
  lastSuccessfulAutoRefreshAt DateTime?
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt
}
```

```ts
const DEFAULT_FEED_AUTO_REFRESH_INTERVAL_HOURS = 6;

return {
  feedAutoRefreshIntervalHours:
    validated.FEED_AUTO_REFRESH_INTERVAL_HOURS ??
    DEFAULT_FEED_AUTO_REFRESH_INTERVAL_HOURS,
  // ...
};
```

2. 扩展 `FeedIngestionService`，让唤醒调用方能够复用 canonical 流水线、传入触发来源，并拿到结构化运行结果：

```ts
async ingestFromOpml(
  opmlPath: string,
  options: FeedIngestionOptions = {},
): Promise<FeedIngestionRunResult> {
  const trigger = options.trigger ?? "bootstrap";
  const maxAttemptsPerFeed = Math.max(1, options.maxAttemptsPerFeed ?? 1);
  // ...

  return {
    failedCount,
    status: summaryStatus,
    successCount,
    totalFeeds: subscriptions.length,
    trigger,
  };
}
```

3. 新增一个只负责唤醒场景的编排层：检测同进程恢复间隔、跳过已在运行中的重复触发、按持久化间隔 gate 执行，并且只有在整次运行结束且至少一个 feed 成功后才推进成功时间戳：

```ts
async checkHeartbeat(nowMs: number = Date.now()) {
  const gapMs = nowMs - this.lastHeartbeatAt;
  this.lastHeartbeatAt = nowMs;

  if (gapMs < RESUME_GAP_THRESHOLD_MS) {
    return;
  }

  await this.handleWakeResume(nowMs, gapMs);
}

private async handleWakeResume(nowMs: number, gapMs: number) {
  if (this.isRefreshRunning) {
    return;
  }

  const lastSuccessfulAutoRefreshAt =
    await this.repository.getLastSuccessfulAutoRefreshAt();

  if (
    lastSuccessfulAutoRefreshAt &&
    nowMs - lastSuccessfulAutoRefreshAt.getTime() < intervalMs
  ) {
    return;
  }

  const result = await this.feedIngestionService.ingestFromOpml(
    config.feedOpmlPath,
    {
      maxAttemptsPerFeed: 3,
      trigger: "auto_refresh_resume",
    },
  );

  if (result.successCount > 0) {
    await this.repository.markSuccessfulAutoRefresh(new Date(nowMs));
  }
}
```

同时补了五层回归保护：

1. `apps/api/src/config/app-config.spec.ts` 锁住 `FEED_AUTO_REFRESH_INTERVAL_HOURS` 的默认值与校验规则。
2. `apps/api/src/feeds/feed-ingestion.service.spec.ts` 锁住结构化运行结果与有界重试行为。
3. `apps/api/src/feeds/feed-auto-refresh.service.spec.ts` 覆盖首次运行、过期状态、未过期间隔、运行中去重，以及 full-failure 时间戳语义。
4. `apps/api/e2e/feed-auto-refresh.e2e-spec.ts` 证明唤醒触发的刷新仍然沿用 canonical article-content 路径。
5. `apps/api/e2e/prisma-schema.e2e-spec.ts` 证明这个单例表存在，并且不会污染 `Feed` 行结构。

## Why This Works

关键点在于把“编排职责”和“ingestion 所有权”分开，而不是分叉整条流水线。

- `FeedAutoRefreshService` 只负责唤醒检测、间隔 gate 与并发去重。
- `FeedIngestionService` 继续是 feed 抓取、持久化、Markdown 富化与 summary 调度的唯一 owner。
- `FeedAutoRefreshState` 让成功时间戳保持全局且持久化，这和产品规则一致，也能跨进程重启保留状态。
- 返回的 run result 让唤醒层可以区分 `all_success`、`partial_success` 和 `full_failure`，不用自己重新解释 ingestion 日志。
- 因为唤醒路径调用的是同一条 ingestion 主干，所以新文章仍会进入与 bootstrap ingestion 相同的下游 article-content 与 summary 契约。

## Prevention

- 保持 bootstrap 与 wake 两套语义显式分离。以后新增调用方时，应传 `trigger`，不要继续复用 `INGEST_ON_BOOT` 来硬塞含义。
- 在测试里保住“单例状态边界”：schema 覆盖应持续证明唤醒刷新状态存在于 `Feed` 之外。
- 继续保留围绕 interval gating、运行中去重、canonical 流水线复用的单测和 e2e；这些是本切片最脆弱的契约。
- 如果以后再给 ingestion 调用方增加 retry 逻辑，要把 retry budget 与 retryability 判断继续收拢在 `FeedIngestionService` 附近，避免编排层重新长出自定义抓取循环。
- 最后一份评审交接 `.claude/handoffs/2026-04-20-163932-ce-review-feed-auto-refresh.md` 记录了后续关注点，但这个分支在那次评审之后并没有继续改代码；未来读者应把它当作评审上下文，而不是已落地修复的一部分。

## Related Issues

- 中度重叠：`docs/en/solutions/integration-issues/feed-ingestion-retries-missing-article-markdown-2026-04-17.md` + `docs/zh-Hans/solutions/integration-issues/feed-ingestion-retries-missing-article-markdown-2026-04-17.md` - 同属 feed-ingestion 恢复问题域，也都强调 canonical 流水线原则，但根因与触发面不同
- `apps/api/src/feeds/feed-auto-refresh.service.ts`
- `apps/api/src/feeds/feed-auto-refresh.repository.ts`
- `apps/api/src/feeds/feed-ingestion.service.ts`
- `apps/api/src/feeds/feed-ingestion.types.ts`
- `apps/api/prisma/models/feed-auto-refresh-state.prisma`
- `apps/api/prisma/migrations/202604200001_add_feed_auto_refresh_state/migration.sql`
- `apps/api/e2e/feed-auto-refresh.e2e-spec.ts`
- `apps/api/e2e/prisma-schema.e2e-spec.ts`
- `apps/api/README.md`
- `docs/en/brainstorms/2026-04-20-feed-auto-refresh-on-wake-requirements.md`
- `docs/zh-Hans/brainstorms/2026-04-20-feed-auto-refresh-on-wake-requirements.md`
- `docs/en/plans/2026-04-20-001-feat-feed-auto-refresh-on-wake-plan.md`
- `docs/zh-Hans/plans/2026-04-20-001-feat-feed-auto-refresh-on-wake-plan.md`
- `.claude/handoffs/2026-04-20-155612-feed-auto-refresh-on-wake.md`
- `.claude/handoffs/2026-04-20-163932-ce-review-feed-auto-refresh.md`
- GitHub issue 搜索：`gh issue list --search "feed auto refresh wake resume ingestion" --state all --limit 5` 未找到匹配 issue
