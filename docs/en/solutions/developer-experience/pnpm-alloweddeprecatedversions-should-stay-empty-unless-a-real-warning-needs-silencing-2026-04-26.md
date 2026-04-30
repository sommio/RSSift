---
title: pnpm allowedDeprecatedVersions should stay empty unless a real warning needs silencing
date: 2026-04-26
category: developer-experience
module: pnpm workspace config
problem_type: developer_experience
component: package_manager_configuration
severity: low
applies_when:
  - reviewing `pnpm-workspace.yaml`
  - `allowedDeprecatedVersions` is used as a default blanket allowlist
  - the repo does not directly depend on the deprecated package
  - a deprecation entry exists only to silence upstream transitive noise
  - maintainers want to remove config that does not change behavior
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

# pnpm allowedDeprecatedVersions should stay empty unless a real warning needs silencing

## Context

This repo currently keeps the following entries in `pnpm-workspace.yaml`:

```yaml
allowedDeprecatedVersions:
  glob: "*"
  inflight: "*"
  whatwg-encoding: "*"
```

Historical review of the lockfile showed that the deprecated versions are
coming from transitive dependencies, not from direct workspace manifests.
`glob@7.2.3` is pulled in by upstream tooling, `inflight@1.0.6` comes from that
older `glob` line, and `whatwg-encoding@3.1.1` is also brought in through the
dependency tree.

The important part is the shape of the problem:

- the repo still installs successfully without the allowlist
- the allowlist does not fix the dependency tree
- the entry only suppresses deprecation noise

## Guidance

Prefer removing `allowedDeprecatedVersions` entries unless there is a concrete
and current reason to keep them.

If the repo no longer needs to silence a real warning, the config is just
retained debt. It makes `pnpm-workspace.yaml` look intentional even when it is
only papering over an upstream transitive issue.

Keep the allowlist only when all of these are true:

- the deprecated package is still present in the resolved lockfile
- the warning is actually noisy enough to matter
- there is no practical upgrade path yet

If the package is only there as historical ballast, remove the config and let
the warning surface again. That makes the real dependency problem visible.

## Why This Matters

Blanket allowlists are easy to forget. Over time they stop being an exception
mechanism and start becoming a hidden default.

That creates two problems:

- maintainers may assume the dependency tree is healthier than it is
- new deprecated packages can get normalized without anyone noticing

In this repo, the safe default is to keep the workspace config minimal and
remove deprecated-version exceptions unless they still solve an active problem.

## When to Apply

- when reviewing `pnpm-workspace.yaml`
- when a deprecated version entry was added only to quiet install output
- when the repo has no direct dependency on the deprecated package
- when the lockfile still resolves the package through transitive tooling
- when you want config to reflect real policy instead of legacy noise

## Examples

Overly broad pattern:

```yaml
allowedDeprecatedVersions:
  glob: "*"
  inflight: "*"
  whatwg-encoding: "*"
```

Preferred approach when no active warning needs silencing:

```yaml
packages:
  - "apps/*"
  - "packages/*"
allowBuilds:
  "@nestjs/core": true
  sharp: true
  unrs-resolver: true
```

If a specific warning becomes truly actionable again, add back only the exact
entry that is still needed.

## Related

- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `docs/zh-Hans/solutions/developer-experience/pnpm-alloweddeprecatedversions-should-stay-empty-unless-a-real-warning-needs-silencing-2026-04-26.md`
