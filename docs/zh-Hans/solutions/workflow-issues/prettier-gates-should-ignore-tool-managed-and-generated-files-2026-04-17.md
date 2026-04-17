---
title: 让 Prettier gate 排除工具管理与生成型文件
date: 2026-04-17
category: workflow-issues
module: format gate boundaries
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - 仓库使用 `prettier --check .` 这类 root 级格式门禁
  - CI 失败指向 lockfile 或其他生成型产物
  - 某个文件由包管理器或外部工具维护，而不是由人手编辑维护
  - 纯格式 churn 正在制造没有语义价值的 review 噪音
  - 维护者正在决定是否扩大 `.prettierignore` 的边界
tags:
  [
    prettier,
    prettierignore,
    pnpm-lock,
    lockfile,
    ci,
    generated-files,
    tool-managed,
    formatting,
  ]
---

# 让 Prettier gate 排除工具管理与生成型文件

## Context

这个仓库的 root 命令 `pnpm format:check` 当前实际会执行
`prettier --check .`。这意味着 `.prettierignore` 不是单纯的编辑器便利
配置，而是质量门禁边界的一部分。

最近一次 CI 失败清楚说明了这条边界为什么重要。`pr-quality / format`
job 唯一失败的原因，是 `pnpm-lock.yaml` 不符合 Prettier 偏好的 YAML
排版方式。那次 lockfile 变更完全只是格式变化，diff 很大，却没有任何
行为价值。结果就是 gate 变得嘈杂，注意力也被从真正 repo-owned 的表面
移开了。

## Guidance

不要随手把工具管理或生成型文件纳入全仓 Prettier gate。

如果某个文件的权威来源是外部工具，就应该优先让那个工具决定它的形状；
除非仓库里有非常强的、明确的理由，否则不应把它继续纳入
`prettier --check .`。

对这个仓库来说，`pnpm-lock.yaml` 应该被视为包管理器拥有的产物：

- 它仍然要提交进 git，以保证可复现安装和缓存正确性
- 让 `pnpm` 在依赖变化时自然更新它
- 不要把它放进 root Prettier gate，以避免制造巨大的、无语义的 diff
- 用 `.prettierignore` 显式表达这个边界

实用规则可以非常简单：format gate 应该覆盖 repo-owned 内容，而不是
覆盖所有被追踪的文件。

## Why This Matters

当格式门禁失败在一些并不期待由人手塑形的文件上时，它就会开始误导人。

这次的直接红灯看起来像一次格式回归，但更深层的问题其实是边界漂移：
这个 gate 检查的是一个由 `pnpm` 拥有的文件，而不是一个由仓库格式约定
拥有的文件。这样的漂移会带来三个问题：

- reviewer 会看到巨大但没有行为意义的 lockfile diff
- 下游 job 也可能被级联打红，导致定位根因更慢
- 工程师容易开始“修 generated file”，而不是修 gate 的边界

只有当 repo 级格式规则的覆盖范围，真正对应团队希望人工维护的文件集合时，
这个规则才是可信的。

## When to Apply

- 当 CI format 失败指向 `pnpm-lock.yaml`、生成型 manifest，或其他机器拥有的文件时
- 当 `prettier --check .` 这类 root format 命令比仓库真实拥有边界更宽时
- 当仓库引入新的 tool-managed 目录或产物时
- 当你在判断一次嘈杂的 format 失败，到底该靠重排文件内容修，还是该靠收紧
  `.prettierignore` 修时
- 当 review churn 因为格式步骤触碰生成产物而不断放大时

## Examples

坏边界：

```gitignore
# .prettierignore
.agents/
.cache/
.claude/
.codex/
.omx/
.turbo/
tmp/
```

在这个配置下，root format gate 仍然会检查 `pnpm-lock.yaml`：

```json
{
  "scripts": {
    "format:check": "prettier --check ."
  }
}
```

更好的边界：

```gitignore
# .prettierignore
.agents/
.cache/
.claude/
.codex/
.omx/
.turbo/
pnpm-lock.yaml
tmp/
```

更正确的心智模型：

```text
Lockfile 继续纳入 git。
让 pnpm 负责重生成它。
不要用 Prettier 制造只改 lockfile 排版的大 diff。
```

## Related

- `docs/en/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`
- `docs/zh-Hans/solutions/workflow-issues/github-pr-quality-ci-trusted-base-scope-and-ui-bootstrap-2026-04-12.md`
- `.prettierignore`
- `package.json`
- `pnpm-lock.yaml`
