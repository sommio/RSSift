---
title: Nest CLI assets 不应指向仅测试使用的 fixtures
date: 2026-05-02
category: integration-issues
module: apps/api build
problem_type: integration
component: nest_cli_assets
severity: low
applies_when:
  - 审查 `apps/api/nest-cli.json`
  - fixture 文件只给 Jest spec 用，放在 `src/**/fixtures` 下
  - Nest build 的 assets 配置指向了已经不存在的路径
tags:
  [apps-api, nest-cli, build-assets, fixtures, test-only, integration-review]
---

# Nest CLI assets 不应指向仅测试使用的 fixtures

## 背景

`apps/api/nest-cli.json` 里原来有一条 `assets` 配置指向
`articles/fixtures/**/*`，但真实 fixture 现在放在
`src/article-content/fixtures/`，而且只在
`article-content-extraction.service.spec.ts` 里通过
`readFileSync(__dirname, "fixtures", ...)` 读取。

这条 asset 规则因此同时有两个问题：

1. 指向旧路径，和当前仓库结构不一致。
2. 试图把仅供 spec 使用的 HTML 样本当成 build 资产，运行时代码并不读取它们。

## Review 意见

**直接删掉这段 asset block，不要保留死路径。**

- Jest spec 直接从源码目录读取 fixture 文件。
- `nest build` 产物不在 spec 执行路径里。
- 保留过期 asset 规则会给人一种“打包配置在这里有用”的错觉。

## 为什么重要

仅测试使用的 fixtures 应该保持在测试本地，除非运行时代码或打包流程真的需要它们。如果 build 配置引用了它们，要么同步到真实路径，要么直接删除。

这个仓库里更安全的选择是删除：这些 fixtures 只是源码级测试输入，不是可部署资产。
