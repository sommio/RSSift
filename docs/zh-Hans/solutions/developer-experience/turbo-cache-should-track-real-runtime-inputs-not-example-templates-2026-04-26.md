---
title: Turbo 缓存应追踪真实运行时输入，而不是 example 模板
date: 2026-04-26
category: developer-experience
module: turbo cache inputs
problem_type: developer_experience
component: development_workflow
severity: medium
applies_when:
  - 审查 `turbo.json` 里的 env 文件或本地配置文件缓存输入
  - `globalDependencies` 指向 example 模板，而不是实际运行时文件
  - 某个被追踪的文件在仓库中根本不存在
  - 期望缓存失效反映运行时行为，而不是模板 churn
  - 维护者想让 Turbo 提醒开发者本地配置漂移
tags:
  [
    turbo,
    turborepo,
    globaldependencies,
    globalenv,
    env-example,
    cache-hash,
    local-config,
    developer-experience,
  ]
---

# Turbo 缓存应追踪真实运行时输入，而不是 example 模板

## Context

这个仓库的 `turbo.json` 目前把三个 example 文件放进了
`globalDependencies`：

- `apps/api/.env.example`
- `apps/api/feeds.opml.example`
- `apps/web/.env.example`

第一个问题很直接：`apps/web/.env.example` 在仓库里根本不存在，所以
Turbo 没有任何真实文件可追踪。

另外两个条目更隐蔽。它们追踪的是 example 模板，但真正的运行时输入在
别处：

- `.env` 相关值已经由 `globalEnv` 覆盖
- `FEED_OPML_PATH` 指向的是实际的 `feeds.opml` 文件，而不是 example
  模板

这意味着缓存 key 被绑到了模板文件上，而不是直接驱动运行时行为的输入上。

## Guidance

用 `globalEnv` 追踪真正影响 task hash 的环境变量。
用 `globalDependencies` 追踪 build 或 task 真正读取的文件。

不要因为 example 文件能说明本地初始化步骤，就默认它适合作为缓存输入。

对这个仓库来说：

- `apps/web/.env.example` 不是有效缓存输入，因为文件不存在
- `apps/api/.env.example` 基本是冗余的，因为 `globalEnv` 已经追踪了真正
  重要的运行时变量
- `apps/api/feeds.opml.example` 方向是反的，因为真正运行时使用的是
  `feeds.opml`，而那是本地文件，不是 example 模板

如果意图是让开发者在 example 模板变化后更新自己的本地文件，那 Turbo
并不能干净地表达这个契约。它只能重新计算 cache hash，并不会提醒人去
把新变量复制进 `.env.local`，也不会提醒人重新生成本地 `feeds.opml`。

## Why This Matters

这是边界问题，不只是“少配了一个文件”。

`globalEnv` 和 `globalDependencies` 追踪的是不同层面：

- `globalEnv` 追踪运行时值；这些值变化时，cache behavior 才应该变化
- `globalDependencies` 追踪文件内容；这些文件内容变化时，cache behavior
  才应该变化

example 模板通常不属于真实运行时契约的这一层。它可能是有用的文档，
但不等于真正驱动 app 的变量或文件。

这样会带来两个风险：

- 误以为 cache invalidation 已经和 runtime behavior 对齐
- 模板只改了说明文字，却仍然触发无意义的 cache churn

## When to Apply

- Turbo cache 规则引用了 `.env.example` 或其他模板文件时
- 某个被追踪文件只是 bootstrap 辅助，而不是实际运行时输入时
- `globalEnv` 已经覆盖了真实变量值时
- 真正的输入是 `feeds.opml` 这类本地文件时
- 维护者要判断一个 cache input 到底是在做教学、追踪，还是两者都在做

## Examples

当前模式：

```json
{
  "globalDependencies": [
    "**/.env.*local",
    "apps/api/.env.example",
    "apps/api/feeds.opml.example",
    "apps/web/.env.example"
  ],
  "globalEnv": ["API_BASE_URL", "DATABASE_URL", "FEED_OPML_PATH"]
}
```

更正确的心智模型：

```text
把真实 env 值放进 globalEnv。
把真实运行时文件放进 globalDependencies。
把 example 模板留给 docs 和初始化指引。
```

## Related

- `turbo.json`
- `apps/api/.env.example`
- `apps/api/feeds.opml.example`
- `apps/web/.env.example`
- `docs/zh-Hans/CONTRIBUTING.md`
