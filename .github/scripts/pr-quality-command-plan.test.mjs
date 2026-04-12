import assert from "node:assert/strict";
import test from "node:test";

import { createPrQualityCommandPlan } from "./pr-quality-command-plan.mjs";

test("docs-only plan becomes explicit no-op for every job", () => {
  const result = createPrQualityCommandPlan({
    job: "format",
    docsOnly: true,
    runMode: "noop",
    canUseRemoteCache: true,
  });

  assert.deepEqual(result, {
    should_run: false,
    command: "",
    uses_remote_cache: false,
    reason: "docs-only-noop",
  });
});

test("affected static plan uses turbo affected commands", () => {
  const result = createPrQualityCommandPlan({
    job: "static",
    docsOnly: false,
    runMode: "affected",
    canUseRemoteCache: true,
  });

  assert.equal(
    result.command,
    "turbo run lint --affected && turbo run typecheck --affected",
  );
  assert.equal(result.uses_remote_cache, true);
  assert.equal(result.reason, "affected-static-gate");
});

test("full static plan uses repo-level commands", () => {
  const result = createPrQualityCommandPlan({
    job: "static",
    docsOnly: false,
    runMode: "full",
    canUseRemoteCache: false,
  });

  assert.equal(result.command, "pnpm lint && pnpm typecheck");
  assert.equal(result.uses_remote_cache, false);
  assert.equal(result.reason, "full-static-gate");
});

test("affected test plan preserves root-owned tests and affected workspace tests", () => {
  const result = createPrQualityCommandPlan({
    job: "test",
    docsOnly: false,
    runMode: "affected",
    canUseRemoteCache: true,
  });

  assert.equal(result.command, "pnpm test:root && turbo run test --affected");
  assert.equal(result.reason, "affected-test-gate");
});

test("e2e stays as a full terminal gate for code changes", () => {
  const result = createPrQualityCommandPlan({
    job: "e2e",
    docsOnly: false,
    runMode: "affected",
    canUseRemoteCache: true,
  });

  assert.equal(result.command, "pnpm test:e2e");
  assert.equal(result.uses_remote_cache, true);
  assert.equal(result.reason, "full-e2e-terminal-gate");
});
