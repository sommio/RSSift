---
title: pnpm allowedDeprecatedVersions 应保持空白，除非真的需要压警告
date: 2026-04-26
category: developer-experience
module: pnpm workspace config
problem_type: developer_experience
component: package_manager_configuration
severity: low
applies_when:
  - 审查 `pnpm-workspace.yaml` 时
  - `allowedDeprecatedVersions` 被当成默认兜底白名单时
  - 仓库并没有直接依赖对应的 deprecated 包时
  - 某条 deprecated 配置只是为了压住上游传递依赖噪音时
  - 维护者想删掉不会改变行为的配置时
tags:
  [
    pnpm,
    pnpm-workspace,
    alloweddeprecatedversions,
    deprecated,
    dependency-tree,
    package-manager,
    developer-experience,
  ]
---

# pnpm allowedDeprecatedVersions 应保持空白，除非真的需要压警告

## Context

这个仓库目前在 `pnpm-workspace.yaml` 里保留了下面这段：

```yaml
allowedDeprecatedVersions:
  glob: "*"
  inflight: "*"
  whatwg-encoding: "*"
```

对 lockfile 的历史检查显示，这些 deprecated 版本不是来自 workspace
的直接依赖，而是来自传递依赖。`glob@7.2.3` 是上游工具链带进来的，
`inflight@1.0.6` 来自那条旧的 `glob` 链路，`whatwg-encoding@3.1.1`
也同样是通过依赖树被拉进来的。

问题的关键是形状：

- 仓库在删除白名单后仍然可以正常安装
- 白名单并不能修复依赖树
- 它只是在压 deprecated 提示

## Guidance

除非有明确且仍然有效的理由，否则尽量删掉
`allowedDeprecatedVersions` 条目。

如果仓库已经不需要压住某个真实 warning，这段配置就是遗留债务。
它会让 `pnpm-workspace.yaml` 看起来像是在表达政策，但其实只是替
上游传递依赖问题遮羞。

只有同时满足下面几条时，才保留白名单：

- deprecated 包仍然会出现在解析后的 lockfile 里
- 这个 warning 的噪音已经足够大，值得特意压掉
- 目前没有现实可行的升级路径

如果它只是历史包袱，就删掉配置，让 warning 重新浮出来。这样才能
看见真实的依赖问题。

## Why This Matters

白名单很容易被遗忘。时间久了，它们不再是例外机制，而会变成隐性
默认值。

这会带来两个问题：

- 维护者可能误以为依赖树比实际更健康
- 新出现的 deprecated 包会被默认为“正常”，没人再注意

在这个仓库里，更安全的默认值是保持 workspace 配置尽量精简；除非
deprecated 例外仍在解决一个活跃问题，否则就删掉。

## When to Apply

- 审查 `pnpm-workspace.yaml` 时
- 某条 deprecated 例外只是为了安静安装输出时
- 仓库没有直接依赖这个 deprecated 包时
- lockfile 只是通过传递依赖解析到这个包时
- 想让配置表达真实策略，而不是历史噪音时

## Examples

过宽的写法：

```yaml
allowedDeprecatedVersions:
  glob: "*"
  inflight: "*"
  whatwg-encoding: "*"
```

如果当前没有需要压的活跃 warning，更推荐这样保持最小配置：

```yaml
packages:
  - "apps/*"
  - "packages/*"
allowBuilds:
  "@nestjs/core": true
  sharp: true
  unrs-resolver: true
```

如果某个具体 warning 以后真的又变成必须处理的问题，再只补回那一
条确实需要的例外。

## Related

- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `docs/en/solutions/developer-experience/pnpm-alloweddeprecatedversions-should-stay-empty-unless-a-real-warning-needs-silencing-2026-04-26.md`
