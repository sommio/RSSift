---
title: 让 CI e2e 的运行时输入与 seed 目标和托管服务阶段保持一致
date: 2026-04-16
category: integration-issues
module: ci e2e pipeline
problem_type: integration_issue
component: testing_framework
symptoms:
  - apps/api e2e 在本地可能通过，但在 CI 中会出现数据库错位症状，例如 "The table public.Article does not exist in the current database"
  - apps/web Playwright 在本地有 apps/web/.env.local 时可能通过，但在 GitHub Actions 中会因为托管 web server 在 build 和 start 阶段没有拿到同一个 API base URL 而失败
  - 在更早的 CI 修复已经让 scope、format、static 和 test 变绿后，pr-quality / e2e 仍然保持红色
root_cause: config_error
resolution_type: config_change
severity: high
related_components:
  - database
  - development_workflow
tags:
  [
    ci,
    e2e,
    playwright,
    jest,
    prisma,
    database-url,
    api-base-url,
    github-actions,
  ]
---

# 让 CI e2e 的运行时输入与 seed 目标和托管服务阶段保持一致

## Problem

`feat/feed-ingestion` 分支上最后剩下的 CI 失败，并不是某一个单独测试写坏了，而是 e2e harness 认为权威的 reset、seed、build 步骤，与真正启动起来的应用进程读取到的运行时输入发生了漂移。

具体来说，API e2e 和 web Playwright 各自都有一个隐藏的对齐问题。在本地，这两个问题很容易被忽略，因为 `.env.local` 和“两个数据库 URL 恰好相同”会把漂移掩盖掉。

## Symptoms

- GitHub Actions 的 `pr-quality / e2e` 在其他 PR quality job 都变绿后仍然持续失败。
- API e2e 在 CI 中会表现出“缺表”或“连错库”的症状，因为 Nest 应用读取的是 `DATABASE_URL`，而测试 helper reset 和 seed 的是 `TEST_DATABASE_URL`。
- 只要在本地把 `DATABASE_URL` 和 `TEST_DATABASE_URL` 故意设成不同值，就能复现和 CI 一样的错位问题。
- Web Playwright 在 `apps/web/e2e/home.spec.ts` 里失败，因为 `API_BASE_URL` 只在 `pnpm start` 前以内联方式注入，而 Playwright 在 CI 中托管的是 `pnpm build && pnpm start` 整个流程，这两个阶段都需要同一个值。
- 本地机器上因为存在 `apps/web/.env.local` 而通过，容易制造“已经修好”的错觉；但 CI 并没有这个文件。

## What Didn't Work

- 更早一轮的 CI 修复，比如让 `.env.local` 按存在与否可选加载、为 `prisma generate` 提供占位 `DATABASE_URL`、以及在 e2e spec 中使用 `??=` 默认值，虽然都有必要，但它们并不能单独解决最后这批 e2e 失败。
- 让 API e2e suite 继续保留自己的 `DATABASE_URL` 默认值，意味着启动起来的 Nest 应用仍然可能连到和 `prepareTestDatabase()` 准备出来不同的数据库。
- 在 `pretest:e2e` 中继续保留 `prisma migrate reset --config ./prisma.test.config.ts --force`，会和仓库自带的 `prepareTestDatabase()` 流程打架，并在本地复现 `_prisma_migrations` / `P1014` 这类失败，而不是让初始化更简单。
- 只在 `pnpm start` 前写内联的 `API_BASE_URL=http://127.0.0.1:3000`，在本地看起来像是对的，但它并不能清楚保证 Playwright 托管的 Next.js build 阶段和 start 阶段共享同一个运行时契约。

## Solution

只保留一个 reset/seed 的所有者，并让每个真正启动起来的应用进程都读取和它相同的运行时输入。

对 API e2e 来说，要强制被测应用读取和测试 helper reset/seed 相同的数据库 URL：

```ts
process.env["TEST_DATABASE_URL"] ??=
  "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"];
process.env["INGEST_ON_BOOT"] ??= "false";

await prepareTestDatabase();
```

这段变更现在位于 `apps/api/e2e/articles.e2e-spec.ts`，它让启动起来的 `AppModule` 与 fixture 数据库保持一致。

对 API 的脚本面来说，要从 `pretest:e2e` 中移除多余的 Prisma reset，让仓库自己的 helper 继续作为唯一的 reset 所有者：

```json
{
  "scripts": {
    "pretest:e2e": "pnpm db:generate"
  }
}
```

这段变更位于 `apps/api/package.json`。`prepareTestDatabase()` 已经负责 schema reset 和 SQL migration replay，再叠一层 Prisma reset 只会引入第二个彼此冲突的生命周期控制器。

对 web Playwright 来说，要给托管的 Next.js web server 一个共享的环境变量块，让 `pnpm build` 和 `pnpm start` 都拿到同一个 `API_BASE_URL`：

```ts
const webRuntimeEnv = {
  ...process.env,
  API_BASE_URL: process.env["API_BASE_URL"] ?? "http://127.0.0.1:3000",
  NO_COLOR: "",
};

{
  command: "pnpm build && pnpm start",
  env: webRuntimeEnv,
}
```

这段变更位于 `apps/web/playwright.config.ts`。它去掉了对 `apps/web/.env.local` 的隐式依赖，也让 Playwright 在 CI 中托管的 web server 在各阶段使用一致的环境。

## Why This Works

这两次失败本质上属于同一种 integration bug：e2e harness 准备的是一套环境，但真正启动的应用进程消费的是另一套环境。

API 侧修复之所以有效，是因为 app-backed e2e 只有在“reset 目标”“seed 目标”“运行中的 Nest 应用”全部指向同一个数据库时才成立。显式赋值 `DATABASE_URL = TEST_DATABASE_URL`，让这个不变量在应用启动前就成立。

移除 `prisma migrate reset` 之所以有效，是因为这个仓库已经在 `apps/api/test-support/database.ts` 里有一条定制的 reset 路径。只保留一个 reset 所有者，更容易推理，也避免 Prisma 元数据假设和自定义 migration replay 流程互相冲突。

Web 侧修复之所以有效，是因为 Playwright 的 managed server 包裹的是整条命令生命周期。把 `API_BASE_URL` 放进 `env` 块后，build 阶段和 start 阶段都能读到同一个值，而不是依赖内联 shell 赋值或只在本地存在的 `.env.local` 文件。

## Prevention

- 对任何 app-backed e2e suite，都先明确 reset/seed 以哪个 URL 为准，然后在应用启动前强制被测应用使用同一个 URL。
- 不要叠加多个数据库 reset 机制，除非它们是有意组合的。如果 `prepareTestDatabase()` 已经负责 reset 和 migration replay，就不要再把 Prisma CLI reset 塞进 `pretest:e2e`。
- 对 Playwright 的 `webServer` 配置，如果变量会在多个阶段用到，优先使用显式 `env` 对象，而不是只在单个命令前加一次内联前缀。
- 排查 CI-only 问题时，可以在本地故意把 `DATABASE_URL` 和 `TEST_DATABASE_URL` 分开，并用 `CI=true` 运行，尽量复现 CI 语义。
- 只要 CI 不提供本地同样的 `.env.local`，就要对“本地能过”保持怀疑。
- 如果一轮 CI 修复后大多数 job 都已变绿，只有 e2e 仍然发红，就优先检查是不是运行时输入对齐问题，而不是先把它当成泛化的 flaky test。

## Related Issues

- `docs/zh-Hans/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`
- `.claude/handoffs/2026-04-16-151404-ci-e2e-fixes.md`
- `.claude/handoffs/2026-04-16-153021-ci-e2e-final-fixes.md`
- `.claude/handoffs/2026-04-16-160320-web-e2e-ci-followup.md`
- `.github/workflows/pr-quality.yml`
- `apps/api/e2e/articles.e2e-spec.ts`
- `apps/api/test-support/database.ts`
- `apps/api/package.json`
- `apps/web/playwright.config.ts`
