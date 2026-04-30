---
title: Turbo 任务配置在意图简单时应保持可读、扁平
date: 2026-04-26
category: developer-experience
module: turbo task config
problem_type: developer_experience
component: development_workflow
severity: low
applies_when:
  - 在 monorepo 里审查 `turbo.json` 的任务接线
  - 某个任务只需要当前 package 的 `build` 先完成
  - `dependsOn` 链比它表达的意图更难读
  - 同一条依赖边被通过嵌套任务间接写了两遍
tags:
  [turbo, turborepo, turbo.json, dependsOn, build, readability, developer-experience]
---

# Turbo 任务配置在意图简单时应保持可读、扁平

## Context

当一个 Turbo 任务只需要当前 package 的 `build` 先完成时，最简单、
最容易读的写法通常就是最好的写法。

在这个仓库里，像下面这种紧凑的任务块更适合 review：

```json
{
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "lint": {
      "dependsOn": ["build", "^lint"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["build", "^typecheck"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "test:e2e": {
      "dependsOn": ["build"],
      "outputs": []
    }
  }
}
```

这种结构读起来更像意图，而不是机关：

- `build` 负责依赖 package 的 build 顺序
- 叶子任务只依赖本 package 的 `build`
- 任务图足够短，review 时更容易直接看懂

## Guidance

优先写出最短、最贴近真实意图的 `dependsOn` 表达式。

如果 `build` 已经承担了依赖 package 的边，再在每个叶子任务上重复
`^build`，通常只是增加视觉噪音，并不会让契约更清楚。

不要为了统一写法，把同一条依赖规则分散到多层里，除非额外的间接
确实表达了不同的保证。

## Why This Matters

review 的时候，配置文件应该帮助人快速理解行为。

如果一个 `turbo.json` 让人必须在脑子里把 `test -> build -> ^build`
层层展开，才能还原真实规则，那它就比应该的更费脑子。这样不代表仓库
有问题，但会让任务图在审查时更难扫。

更实用的目标是清晰：

- 让 `build` 负责 dependency-package 的 build 顺序
- 让 `test`、`lint`、`typecheck` 专注各自 package 级前置条件
- 不要把一条规则写得比它本来更重

## When to Apply

- 在 code review 里审查 `turbo.json` 时
- 某个任务链能用一个明显的 hop 表达，而不是两层时
- 重复的 `dependsOn` 边让文件更难扫时
- 配置本身没错，但写法显得很吓人时

## Related

- `turbo.json`
- `https://turborepo.dev/docs/reference/configuration`
- `https://turborepo.dev/docs/core-concepts/package-and-task-graph`
