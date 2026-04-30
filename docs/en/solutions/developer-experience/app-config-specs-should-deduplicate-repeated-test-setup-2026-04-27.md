---
title: App config specs should deduplicate repeated temp-root and env setup
date: 2026-04-27
category: developer-experience
module: apps/api config specs
problem_type: developer_experience
component: testing_framework
severity: low
applies_when:
  - reviewing config specs that construct temporary filesystem roots
  - multiple cases repeat the same env baseline with only one or two overrides
  - `try/finally rmSync(...)` appears in every test
  - setup noise makes it hard to see what each case actually proves
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

# App config specs should deduplicate repeated temp-root and env setup

## Context

In `apps/api/src/config/app-config.spec.ts`, almost every test repeats the same
scaffolding:

- create a temporary API root
- write a minimal `package.json`
- call `getAppConfig(...)` with the same `DATABASE_URL` / `TEST_DATABASE_URL`
  baseline
- pass `startDir` into either `src/config` or `dist/src/config`
- clean up with `rmSync(...)` in `finally`

That shape is readable once or twice, but across the whole file it turns config
coverage into a lot of boilerplate.

## Guidance

Extract the repeated harness into a small helper or a table-driven factory.

- keep one helper that creates and cleans up the temporary API root
- keep one base env object for shared variables
- only override the env var a test cares about
- use table-driven cases for default, override, and invalid permutations

The goal is not to make the spec clever. The goal is to keep the repeated setup
in one place so each test can show the behavior it actually verifies.

## Why This Matters

When config specs copy the same temporary-root and env setup everywhere, review
noise goes up and new cases become harder to add correctly.

The duplicated scaffolding also hides the important part of each test: which
config edge is being verified. A reader should be able to scan the file and see
the contract differences immediately.

## When to Apply

- When a spec creates a temporary package root or fixture filesystem
- When an env matrix has many one-variable overrides
- When the same `try/finally` cleanup repeats across many cases
- When review comments say the setup is repetitive but the assertions are fine

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
