---
title: 应用配置规格测试应提炼重复的临时根目录和环境搭建
date: 2026-04-27
category: developer-experience
module: apps/api config specs
problem_type: developer_experience
component: testing_framework
severity: low
applies_when:
  - 审查会创建临时文件系统根目录的配置测试时
  - 多个 case 只是在同一份环境变量基线上改一两个值
  - 每个测试都在写 `try/finally rmSync(...)`
  - 这些搭建噪音让人看不清每个 case 真正验证什么
tags:
  [
    apps-api,
    app-config,
    spec,
    test-setup,
    duplication,
    boilerplate,
    developer-experience,
  ]
---

# 应用配置规格测试应提炼重复的临时根目录和环境搭建

## Context

在 `apps/api/src/config/app-config.spec.ts` 里，几乎每个测试都在重复同
一套脚手架：

- 创建临时 API 根目录
- 写入最小 `package.json`
- 用同一份 `DATABASE_URL` / `TEST_DATABASE_URL` 基线调用
  `getAppConfig(...)`
- 把 `startDir` 指到 `src/config` 或 `dist/src/config`
- 最后在 `finally` 里执行 `rmSync(...)` 清理

单看一两个测试还算清楚，但整份文件都这么写，就会把配置覆盖变成大
量样板代码。

## Guidance

把重复的测试脚手架抽成一个小 helper，或者改成表驱动工厂。

- 只保留一个负责创建和清理临时 API 根目录的 helper
- 只保留一份共享变量的基础 env 对象
- 每个测试只覆盖自己关心的那一个 env 值
- 默认值、覆盖值、非法值这些组合，适合用表驱动 case 来写

重点不是把 spec 写得很巧，而是把重复搭建放到一处，让每个测试只暴
露自己真正验证的行为。

## Why This Matters

当配置测试到处复制同样的临时根目录和环境搭建时，review 噪音会变大，
新增 case 也更容易写错。

重复的脚手架还会遮住每个测试真正关心的点：到底在验证哪一个配置边
界。读者应该能快速扫出每个 case 的契约差异。

## When to Apply

- 当 spec 需要创建临时 package root 或 fixture 文件系统时
- 当 env 矩阵里只有单个变量的覆盖变化时
- 当同样的 `try/finally` 清理在很多 case 里重复出现时
- 当 review 里已经有人指出搭建代码重复，但断言本身没问题时

## Examples

Before:

```ts
const apiRoot = createApiRoot();

try {
  const config = getAppConfig(
    {
      DATABASE_URL: "...",
      TEST_DATABASE_URL: "...",
      INGEST_ON_BOOT: "false",
    },
    { startDir: join(apiRoot, "src", "config") },
  );

  expect(config.ingestOnBoot).toBe(false);
} finally {
  rmSync(apiRoot, { force: true, recursive: true });
}
```

After:

```ts
function withApiRoot(run: (apiRoot: string) => void) {
  const apiRoot = createApiRoot();

  try {
    run(apiRoot);
  } finally {
    rmSync(apiRoot, { force: true, recursive: true });
  }
}

const baseEnv = {
  DATABASE_URL: "...",
  TEST_DATABASE_URL: "...",
};

it("keeps ingest-on-boot off when requested", () => {
  withApiRoot((apiRoot) => {
    const config = getAppConfig(
      { ...baseEnv, INGEST_ON_BOOT: "false" },
      { startDir: join(apiRoot, "src", "config") },
    );

    expect(config.ingestOnBoot).toBe(false);
  });
});
```

## Related

- `apps/api/src/config/app-config.ts`
- `apps/api/src/config/app-config.spec.ts`
- `apps/api/src/config/env.validation.ts`
