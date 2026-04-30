---
title: 先把仓库根部工具链迁到 ESM，再处理 NestJS
date: 2026-04-27
category: developer-experience
module: monorepo root toolchain
problem_type: developer_experience
component: development_workflow
severity: low
applies_when:
  - 审查这个 Turborepo monorepo 的根目录工具链时
  - 修改 `turbo.json`、根 `package.json` 或仓库自动化脚本时
  - 决定共享工具配置何时迁移到 ESM 时
  - 想把 `apps/api` 的 NestJS 模块格式迁移和根工具链迁移绑在一起时
  - NestJS v12 还没发布，或者仓库仍在等待上游 ESM 路径时
tags:
  [
    turborepo,
    monorepo,
    esm,
    nestjs,
    toolchain,
    root-config,
    developer-experience,
  ]
---

# 先把仓库根部工具链迁到 ESM，再处理 NestJS

## Context

根目录工具链和应用运行时不是同一个迁移目标。

在这个仓库里，monorepo 根部负责共享的构建和自动化入口：

- `turbo.json`
- 根 `package.json` 里的脚本
- 仓库初始化 / 维护脚本
- 其他运行在 `apps/api` 之外的 workspace 级配置

只要改动的是工具链代码，这一层就应该优先迁到 ESM。

`apps/api` 不一样。NestJS 运行时代码依赖框架和 loader 兼容性，应该
等上游 NestJS 的 ESM 路径准备好再动。可以把 NestJS v12 作为发布门
槛，并跟踪上游工作，比如 `nestjs/nest#16391`，再决定是否切换应用
本身的模块格式。

## Guidance

把迁移拆成两个独立决策：

1. 先迁根目录工具链 / 根部自动化到 ESM
2. 等 NestJS v12 可用后，再迁 NestJS 应用运行时到 ESM

不要把这两件事合并成一个“全部现在一起改”的变更。

如果根部工具链已经可以在 ESM 下运行，就先做这部分。应用侧的 NestJS
格式先保持不变，直到框架发布和上游支持都到位。

## Why This Matters

这两类迁移的爆炸半径不同。

根部工具链迁 ESM，主要影响仓库维护和任务编排。NestJS 迁 ESM，影响
应用启动、模块解析和框架兼容性。把两者混在一起，会让 review 更难，
也更容易出现“工具链已经能改，但被还没准备好的框架迁移卡住”的情况。

分开推进，仓库才能继续往前走，不会把一个兼容性缺口变成两个。

## When to Apply

- 审查根配置或 workspace 脚本时
- 决定 ESM 迁移顺序时
- 现代化 `turbo.json` 或仓库自动化时
- 有人想在上游 NestJS ESM 路径准备好之前先迁 `apps/api` 时
- review 需要明确区分“工具链迁移”和“应用运行时迁移”时

## Related

- `turbo.json`
- 根 `package.json`
- `apps/api`
- `docs/en/solutions/developer-experience/root-toolchain-should-move-to-esm-before-nestjs-does-2026-04-27.md`
- `https://github.com/nestjs/nest/pull/16391`
