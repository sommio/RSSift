---
title: 测试 spec 应隔离环境变量并简化 mock reset 模式
date: 2026-04-30
category: best-practices
module: apps/api feed ingestion specs
problem_type: best_practices
component: testing_framework
severity: low
applies_when:
  - reviewing test spec setup/teardown functions
  - env vars are set in beforeEach but never cleaned in afterEach
  - jest.mockReset() called individually on every mock when clearAllMocks() suffices
  - DATABASE_URL is hardcoded in test setup despite no real DB usage
tags:
  [
    apps-api,
    feed-ingestion,
    spec,
    test-setup,
    env-isolation,
    mock-management,
    best-practices,
  ]
---

# 测试 spec 应隔离环境变量并简化 mock reset 模式

## 背景

`apps/api/src/feeds/feed-ingestion.service.spec.ts` 中 `resetFeedIngestionSpecState()`
存在几个问题：

1. `DATABASE_URL` 硬编码但 `afterEach` 未清理，可能污染其他 spec。
2. 所有依赖都已 mock（无真实数据库），设置 `DATABASE_URL` 对测试逻辑无实际意义。
3. 七个独立 `.mockReset()` 调用可用 `jest.clearAllMocks()` 替代。
4. `afterEach` 中的 `restoreAllMocks()` 与 `afterAll` 重复——restore 应在 suite 级别。

## 模式

**应做：**

- 把魔法值（env 值、URL）抽成文件级命名常量。
- 用 `jest.clearAllMocks()` 替代逐个 mock reset。
- 在 `afterEach` 中清理所有 env 修改（`delete process.env[...]`）。
- `restoreAllMocks()` 只放在 `afterAll`，不要在 `afterEach` 重复。
- 只设置被测代码实际读取的 env 变量。

**不应做：**

- 作为"以防万一"的安全网设置不需要的 env 变量。
- 让 env 污染跨 test case 传播。
- 在同一作用域混用 `restoreAllMocks` 和 `mockReset` 而无明确理由。

## 修复

```ts
const DATABASE_URL = "postgresql://rssift:rssift@127.0.0.1:5432/rssift";

function resetFeedIngestionSpecState() {
  jest.useRealTimers();
  process.env["DATABASE_URL"] = DATABASE_URL;
  delete process.env["FEED_MAX_ARTICLES_PER_FEED"];

  jest.clearAllMocks();

  transaction.mockImplementation((callback) => Promise.resolve(callback(tx)));
  feedUpsert.mockResolvedValue({ id: "feed-1" });

  service = createFeedIngestionService();
  tempDir = mkdtempSync(join(tmpdir(), "rssift-feed-ingestion-spec-"));
}

afterEach(() => {
  delete process.env["DATABASE_URL"];
  if (tempDir) {
    rmSync(tempDir, { force: true, recursive: true });
  }
});

afterAll(() => {
  jest.restoreAllMocks();
});
```

## 重要性

- env 污染是静默的：一个 spec 设置 `DATABASE_URL` 可能导致另一个 spec 意外连接真实数据库或读取过期配置。
- 逐个 mock reset 冗长且在新增 mock 时容易遗漏。
- `restoreAllMocks` 在 `afterEach` 和 `afterAll` 中重复无意义。
