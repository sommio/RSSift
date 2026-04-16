---
title: 保持 API 测试 surface 语义清晰，并让可维护性护栏留在 package 本地
date: 2026-04-16
category: workflow-issues
module: api test surfaces and lint guardrails
problem_type: workflow_issue
component: tooling
severity: medium
applies_when:
  - 一个 package 同时存在 colocated spec 与 app-level e2e suite
  - 共享测试 helper 已经被 e2e 之外的测试复用
  - monorepo 已经具备 package-local eslint 入口
  - 需要给可维护性预算加回归覆盖，但不想新增第二条 lint 路径
symptoms:
  - 一个名字看起来像 e2e 的目录里，实际放着被 colocated spec 复用的 helper
  - package-local eslint 已经存在，但还没有对大文件、大函数或高复杂度施加预算
  - root lint 会误解析那些只在 package 上下文里才有意义的 synthetic fixture
root_cause: missing_workflow_step
resolution_type: workflow_improvement
tags:
  [
    api-e2e,
    test-support,
    package-local-eslint,
    eslint-guardrails,
    monorepo,
    turborepo,
    testing-boundaries,
    repo-tooling,
  ]
---

# 保持 API 测试 surface 语义清晰，并让可维护性护栏留在 package 本地

## Context

这个仓库原本就有两层健康的 API 测试结构，但其中一层的边界命名会误导读者。feature-local spec 已经放在 `apps/api/src/**/*.spec.ts`，而 app-level 的 HTTP / database suite 则集中在 `apps/api/test`。问题在于，`apps/api/test` 实际上并不是纯 e2e surface：`apps/api/src/articles/article.repository.spec.ts` 会从这棵树里导入共享数据库 helper。

与此同时，monorepo 早已有 `apps/api/eslint.config.mjs` 和 `apps/web/eslint.config.mjs` 这样的 package-local ESLint 入口，但对大文件、大函数和高复杂度控制流还没有任何可维护性预算。仓库需要补上一层小而稳的 guardrail，同时不能为此再发明第二条 lint enforcement path。

## Guidance

在 `apps/api` 内部显式拆出三类测试 surface，并把 repo-specific 的 ESLint 阈值留在各自 app 的配置里。

1. 让 feature-local spec 继续 colocate 在 `apps/api/src/**/*.spec.ts`。
2. 把 app-level suite 及其 Jest 配置放进 `apps/api/e2e/**`。
3. 那些被 colocated spec 和 e2e 共用的 helper，迁到 `apps/api/test-support/**`，不要继续留在 e2e-only 命名空间下。
4. `max-lines`、`max-lines-per-function` 与 `complexity` 这类数字阈值，留在各 app 自己的 `eslint.config.mjs` 中，不要下沉到 `packages/eslint-config`。
5. 用 `.github/scripts/` 下的 repo-owned 回归 harness 校验这些阈值，但真正的 enforcement path 仍然保持为既有的 `pnpm lint` -> `turbo run lint`。
6. 如果某些 fixture 只有在 harness 把它 materialize 成 app-relative 路径后才有意义，就要在 root ESLint config 中忽略这些原始 fixture 模板。

API 边界修正后的结构应该是：

```text
apps/api/src/**/*.spec.ts      # colocated 单测 / 窄范围集成测试
apps/api/e2e/**                # app-level HTTP / database suite
apps/api/test-support/**       # spec 与 e2e 共用的 helper
```

最直接的边界修正体现在导入路径变化上：

```ts
import {
  createTestPrismaClient,
  prepareTestDatabase,
} from "../../test-support/database";
```

之后，可维护性策略继续留在 package 本地。例如在 `apps/api/eslint.config.mjs` 里，生产代码和测试代码采用不同预算：

```js
{
  files: ["src/**/*.ts"],
  ignores: ["src/**/*.spec.ts", "src/generated/**"],
  rules: productionRules,
},
{
  files: ["src/**/*.spec.ts", "test-support/**/*.ts", "e2e/**/*.ts"],
  rules: testRules,
},
```

再用 repo-owned harness 去证明这些 file-role glob 没有漂移：

```js
test("API e2e fixtures share the relaxed test budget", (t) => {
  const result = withFixture(
    t,
    apiDir,
    "api/e2e-pass.e2e-spec.ts",
    `e2e/__guardrails__/${id}/e2e-pass.e2e-spec.ts`,
  );

  assert.equal(result.errorCount, 0);
});
```

## Why This Matters

这个模式同时修正了两类漂移。

第一，文件系统语义不再“说谎”。如果一个 colocated spec 需要从名字像 e2e 的目录里导入 helper，后来的维护者就会推断出错误的 ownership model，并继续扩大这种混乱。`apps/api/e2e` 应该只表示 app-level suite；`apps/api/test-support` 才表示共享的 test-only 基础设施。

第二，可维护性策略继续放在 ownership 已经存在的地方。这个 monorepo 本来就是通过 package-local 入口跑 lint。如果把 repo-specific 数值阈值塞进 `packages/eslint-config` 或者新的 root wrapper，策略会更难按各 app 的真实 inventory 校准，也更容易被误施加到不相干的 package 上。

回归 harness 的价值在于：flat-config 的 `files` glob 很容易在以后重构时被无意间削弱。repo-owned test 能够持续证明 source、spec、e2e、test-support、component 和 App Router entry 等 surface 仍然拿到预期预算，而 CI 仍然只依赖一条 lint 路径。

还有一个需要诚实保留的 caveat：最终 review 发现，当前 web guardrail 覆盖面并没有包含所有普通的 `apps/web/app/**` 生产文件。现在被覆盖的是命名的 App Router special file；如果后续仓库想把更广泛的 `app/**` surface 也纳入预算，需要单独再做一轮跟进。

## When to Apply

- 当一个 package 同时拥有 colocated spec 与 app-level e2e suite
- 当当前位于 e2e 树下的 helper 已被非 e2e 测试复用
- 当 package-local ESLint 入口已经存在，而你想在不新增平行 gate 的前提下加入可维护性预算
- 当你需要为 ESLint override glob 增加回归覆盖，但 CI enforcement 仍应留在正常的 lint pipeline 上

## Examples

Before:

```text
apps/api/test/articles.e2e-spec.ts
apps/api/test/jest-e2e.json
apps/api/test/test-db.ts
apps/api/src/articles/article.repository.spec.ts -> ../../test/test-db
```

After:

```text
apps/api/e2e/articles.e2e-spec.ts
apps/api/e2e/jest-e2e.json
apps/api/test-support/database.ts
apps/api/src/articles/article.repository.spec.ts -> ../../test-support/database
```

root lint 也必须显式知道 harness 的边界：

```js
export default [
  ...baseConfig,
  {
    ignores: [".github/scripts/fixtures/**"],
  },
];
```

没有这条 ignore，root lint 就会在 guardrail harness 还没把 fixture 放进正确 app-relative 上下文之前，先去解析那些 synthetic fixture 文件，结果产生误报。

## Related

- `docs/zh-Hans/solutions/workflow-issues/monorepo-husky-hooks-package-aware-and-bootstrap-stable-2026-04-11.md`
- `docs/zh-Hans/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`
- `docs/zh-Hans/solutions/integration-issues/ci-e2e-runtime-inputs-must-match-seeded-targets-2026-04-16.md`
- `.claude/handoffs/2026-04-16-204405-refactor-test-boundaries-eslint-guardrails.md`
- `.claude/handoffs/2026-04-16-205910-post-review-no-action.md`
