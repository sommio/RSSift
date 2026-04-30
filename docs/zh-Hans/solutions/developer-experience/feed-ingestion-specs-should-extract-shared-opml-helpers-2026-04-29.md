---
title: feed ingestion 测试应提取共享 OPML helper
date: 2026-04-29
category: developer-experience
module: apps/api feeds specs
problem_type: developer_experience
component: test_infrastructure
severity: low
applies_when:
  - 审查 `apps/api/e2e/feed-ingestion.e2e-spec.ts` 和 `apps/api/src/feeds/feed-ingestion.service.spec.ts` 时
  - 两个文件都定义了 `writeOpml` 函数
  - 新增 feed 测试需要手写 OPML fixture
  - `test-support/` 目录已存在但缺少 feed 相关 helper
tags:
  [
    apps-api,
    feeds,
    e2e,
    spec,
    duplication,
    test-helpers,
    developer-experience,
  ]
---

# feed ingestion 测试应提取共享 OPML helper

## Context

`apps/api/e2e/feed-ingestion.e2e-spec.ts` 和
`apps/api/src/feeds/feed-ingestion.service.spec.ts` 都各自定义了
`writeOpml(tempDir, filename, body)` 函数，签名和逻辑完全一致——
往临时目录写入一个 OPML 文件并返回路径。

`test-support/` 目录已经有 `database.ts`，但 feed 相关的 fixture
工具散落在两个 spec 里。

## Guidance

把 `writeOpml` 提取到 `test-support/opml.ts`，两个 spec 改为导入。

- 新建 `apps/api/test-support/opml.ts`，导出 `writeOpml`
- 两个 spec 文件删除本地 `writeOpml` 定义，改为 `import { writeOpml } from "../../test-support/opml"` (e2e) 或 `import { writeOpml } from "../test-support/opml"` (unit)
- 如果后续有更多 feed fixture（如 `createFeedXml`），也归入同一文件
- `getFetchUrl` 只在 e2e 里用，不需要共享

## Why This Matters

重复定义增加维护成本：改签名要改两处，加功能也要改两处。
共享 helper 让新测试写起来更快，也暗示这些工具是项目级的，
不是某个 spec 私有的。

## When to Apply

- 当两个 spec 文件有同名同逻辑的 helper 函数时
- 当 `test-support/` 已有类似用途的文件时
- 当新增 feed 测试需要 OPML fixture 但不知道该抄哪个文件时

## Examples

Before:

```ts
// apps/api/e2e/feed-ingestion.e2e-spec.ts
function writeOpml(tempDir: string, filename: string, body: string) {
  const opmlPath = join(tempDir, filename);
  writeFileSync(opmlPath, body);
  return opmlPath;
}

// apps/api/src/feeds/feed-ingestion.service.spec.ts
function writeOpml(tempDir: string, filename: string, body: string) {
  const opmlPath = join(tempDir, filename);
  writeFileSync(opmlPath, body);
  return opmlPath;
}
```

After:

```ts
// apps/api/test-support/opml.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeOpml(tempDir: string, filename: string, body: string) {
  const opmlPath = join(tempDir, filename);
  writeFileSync(opmlPath, body);
  return opmlPath;
}

// apps/api/e2e/feed-ingestion.e2e-spec.ts
import { writeOpml } from "../test-support/opml";

// apps/api/src/feeds/feed-ingestion.service.spec.ts
import { writeOpml } from "../test-support/opml";
```

## Related

- `apps/api/e2e/feed-ingestion.e2e-spec.ts`
- `apps/api/src/feeds/feed-ingestion.service.spec.ts`
- `apps/api/test-support/database.ts`
