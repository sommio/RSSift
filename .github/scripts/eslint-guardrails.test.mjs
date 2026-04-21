import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const fixturesRoot = join(scriptDir, "fixtures", "eslint-guardrails");

function clearPackageBuildCaches(packageDir) {
  for (const relativePath of [
    "dist/tsconfig.build.tsbuildinfo",
    "tsconfig.tsbuildinfo",
    ".next/cache/.tsbuildinfo",
  ]) {
    rmSync(join(packageDir, relativePath), {
      force: true,
    });
  }
}

function uniqueId() {
  return `guardrails-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function lintTarget(cwd, targetPath) {
  const args = [
    "exec",
    "eslint",
    "--format",
    "json",
    "--config",
    "./eslint.config.mjs",
    targetPath,
  ];

  try {
    const stdout = execFileSync("pnpm", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    });
    return JSON.parse(stdout);
  } catch (error) {
    const stdout = error.stdout?.toString() ?? "";
    if (error.status !== 1 || !stdout) throw error;
    return JSON.parse(stdout);
  }
}
function withFixture(t, packageDir, fixtureRelativePath, targetPath) {
  const fixturePath = join(fixturesRoot, fixtureRelativePath);
  const absoluteTargetPath = join(packageDir, targetPath);
  mkdirSync(dirname(absoluteTargetPath), { recursive: true });
  writeFileSync(absoluteTargetPath, readFileSync(fixturePath, "utf8"));
  t.after(() => {
    rmSync(join(packageDir, targetPath.split("/")[0], "__guardrails__"), {
      force: true,
      recursive: true,
    });
    clearPackageBuildCaches(packageDir);
  });
  return lintTarget(packageDir, targetPath)[0];
}

function ruleIds(result) {
  return new Set(result.messages.map((message) => message.ruleId));
}

const apiDir = join(repoRoot, "apps", "api");
const webDir = join(repoRoot, "apps", "web");

test("API production source fixture stays within the source budget", (t) => {
  const id = uniqueId();
  const result = withFixture(
    t,
    apiDir,
    "api/source-pass.ts",
    `src/__guardrails__/${id}/source-pass.ts`,
  );

  assert.equal(result.errorCount, 0);
});

test("API production source fixture fails when the file budget is exceeded", (t) => {
  const id = uniqueId();
  const result = withFixture(
    t,
    apiDir,
    "api/source-fail.ts",
    `src/__guardrails__/${id}/source-fail.ts`,
  );

  assert.equal(result.errorCount > 0, true);
  assert.equal(ruleIds(result).has("max-lines"), true);
});

test("API spec and test-support fixtures receive the relaxed test budget", (t) => {
  const id = uniqueId();
  const specResult = withFixture(
    t,
    apiDir,
    "api/spec-pass.spec.ts",
    `src/__guardrails__/${id}/spec-pass.spec.ts`,
  );
  const supportResult = withFixture(
    t,
    apiDir,
    "api/spec-pass.spec.ts",
    `test-support/__guardrails__/${id}/database.ts`,
  );
  const sourceFailureResult = withFixture(
    t,
    apiDir,
    "api/spec-pass.spec.ts",
    `src/__guardrails__/${id}/spec-pass.ts`,
  );

  assert.equal(specResult.errorCount, 0);
  assert.equal(supportResult.errorCount, 0);
  assert.equal(sourceFailureResult.errorCount > 0, true);
  assert.equal(
    ruleIds(sourceFailureResult).has("max-lines-per-function"),
    true,
  );
});

test("API e2e fixtures share the relaxed test budget", (t) => {
  const id = uniqueId();
  const result = withFixture(
    t,
    apiDir,
    "api/e2e-pass.e2e-spec.ts",
    `e2e/__guardrails__/${id}/e2e-pass.e2e-spec.ts`,
  );

  assert.equal(result.errorCount, 0);
});

test("Web logic fixture stays within the stricter logic budget", (t) => {
  const id = uniqueId();
  const result = withFixture(
    t,
    webDir,
    "web/logic-pass.ts",
    `src/__guardrails__/${id}/logic-pass.ts`,
  );

  assert.equal(result.errorCount, 0);
});

test("Web logic fixture fails when the logic file budget is exceeded", (t) => {
  const id = uniqueId();
  const result = withFixture(
    t,
    webDir,
    "web/logic-fail.ts",
    `src/__guardrails__/${id}/logic-fail.ts`,
  );

  assert.equal(result.errorCount > 0, true);
  assert.equal(ruleIds(result).has("max-lines"), true);
});

test("Web component fixture stays within the standard TSX component budget", (t) => {
  const id = uniqueId();
  const result = withFixture(
    t,
    webDir,
    "web/component-pass.tsx",
    `src/__guardrails__/${id}/component-pass.tsx`,
  );

  assert.equal(result.errorCount, 0);
});

test("App Router page fixtures use the page budget instead of the standard component budget", (t) => {
  const id = uniqueId();
  const pageResult = withFixture(
    t,
    webDir,
    "web/page-pass.tsx",
    `app/__guardrails__/${id}/page.tsx`,
  );
  const componentFailureResult = withFixture(
    t,
    webDir,
    "web/page-pass.tsx",
    `src/__guardrails__/${id}/page-pass-as-component.tsx`,
  );

  assert.equal(pageResult.errorCount, 0);
  assert.equal(componentFailureResult.errorCount > 0, true);
  assert.equal(
    ruleIds(componentFailureResult).has("max-lines-per-function"),
    true,
  );
});

test("App Router page fixture fails when the entry-file budget is exceeded", (t) => {
  const id = uniqueId();
  const result = withFixture(
    t,
    webDir,
    "web/page-fail.tsx",
    `app/__guardrails__/${id}/page.tsx`,
  );

  assert.equal(result.errorCount > 0, true);
  assert.equal(ruleIds(result).has("max-lines"), true);
});

test("Web test fixtures receive the relaxed test budget", (t) => {
  const id = uniqueId();
  const appSpecResult = withFixture(
    t,
    webDir,
    "web/test-pass.spec.tsx",
    `app/__guardrails__/${id}/page.spec.tsx`,
  );
  const e2eResult = withFixture(
    t,
    webDir,
    "web/logic-pass.ts",
    `e2e/__guardrails__/${id}/home.spec.ts`,
  );

  assert.equal(appSpecResult.errorCount, 0);
  assert.equal(e2eResult.errorCount, 0);
});
