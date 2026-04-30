---
title: Feed ingestion tests should extract shared OPML helper
date: 2026-04-29
category: developer-experience
module: apps/api feeds specs
problem_type: developer_experience
component: test_infrastructure
severity: low
applies_when:
  - Reviewing `apps/api/e2e/feed-ingestion.e2e-spec.ts` and `apps/api/src/feeds/feed-ingestion.service.spec.ts`
  - Both files define a `writeOpml` function
  - New feed tests require hand-written OPML fixtures
  - `test-support/` directory exists but lacks feed-related helpers
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

# Feed ingestion tests should extract shared OPML helper

## Context

`apps/api/e2e/feed-ingestion.e2e-spec.ts` and
`apps/api/src/feeds/feed-ingestion.service.spec.ts` each define their
own `writeOpml(tempDir, filename, body)` function with identical
signature and logic — write an OPML file to a temp directory and
return the path.

`test-support/` already has `database.ts`, but feed-related fixture
helpers are scattered across two spec files.

## Guidance

Extract `writeOpml` into `test-support/opml.ts` and import from both
specs.

- Create `apps/api/test-support/opml.ts` exporting `writeOpml`
- Remove local `writeOpml` definitions from both specs, import from
  `../../test-support/opml` (e2e) or `../test-support/opml` (unit)
- If more feed fixtures appear later (e.g. `createFeedXml`), place
  them in the same file
- `getFetchUrl` is e2e-only, no need to share

## Why This Matters

Duplicate definitions increase maintenance cost: signature changes
require editing two files, new features require editing two files.
A shared helper signals these tools are project-level, not
spec-private, and makes writing new tests faster.

## When to Apply

- When two spec files have same-name, same-logic helper functions
- When `test-support/` already has a similar-purpose file
- When new feed tests need OPML fixtures but it is unclear which
  file to copy from

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
