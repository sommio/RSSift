import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyPrQualityScope,
  isAppLocalPath,
  isDocsOnlyPath,
} from "./pr-quality-scope.mjs";

const SCOPE_SCRIPT_PATH = fileURLToPath(
  new URL("./pr-quality-scope.mjs", import.meta.url),
);

function createTempGitRepo() {
  const repoDir = mkdtempSync(join(tmpdir(), "pr-quality-scope-"));

  execFileSync("git", ["init"], { cwd: repoDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test User"], {
    cwd: repoDir,
    stdio: "ignore",
  });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: repoDir,
    stdio: "ignore",
  });

  return repoDir;
}

function writeRepoFile(repoDir, filePath, content) {
  const absolutePath = join(repoDir, filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function commitAll(repoDir, message) {
  execFileSync("git", ["add", "--all"], { cwd: repoDir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", message], {
    cwd: repoDir,
    stdio: "ignore",
  });

  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoDir,
    encoding: "utf8",
  }).trim();
}

function runScopeCli(repoDir, { base, head }) {
  const stdout = execFileSync(
    process.execPath,
    [SCOPE_SCRIPT_PATH, "--base", base, "--head", head],
    {
      cwd: repoDir,
      encoding: "utf8",
    },
  );

  return JSON.parse(stdout);
}

test("docs-only diffs become explicit no-op mode", () => {
  assert.equal(isDocsOnlyPath("docs/en/guide.md"), true);
  assert.equal(isDocsOnlyPath("README.md"), true);

  const result = classifyPrQualityScope({
    changedFiles: ["docs/en/guide.md", "README.zh-Hans.md"],
    repoFullName: "org/repo",
    headRepoFullName: "org/repo",
    hasTurboToken: true,
    hasTurboTeam: true,
  });

  assert.deepEqual(result, {
    docs_only: true,
    code_change: false,
    run_mode: "noop",
    can_use_remote_cache: true,
    reason: "docs-only",
    changed_files_count: 2,
  });
});

test("deleted docs-only paths remain explicit no-op mode", () => {
  const result = classifyPrQualityScope({
    changedFiles: ["docs/en/archived-guide.md"],
    repoFullName: "org/repo",
    headRepoFullName: "org/repo",
    hasTurboToken: true,
    hasTurboTeam: true,
  });

  assert.equal(result.docs_only, true);
  assert.equal(result.code_change, false);
  assert.equal(result.run_mode, "noop");
  assert.equal(result.reason, "docs-only");
});

test("app-local diffs use affected mode", () => {
  assert.equal(isAppLocalPath("apps/web/app/page.tsx"), true);

  const result = classifyPrQualityScope({
    changedFiles: ["apps/web/app/page.tsx", "docs/zh-Hans/guide.md"],
    repoFullName: "org/repo",
    headRepoFullName: "org/repo",
    hasTurboToken: true,
    hasTurboTeam: true,
  });

  assert.equal(result.run_mode, "affected");
  assert.equal(result.docs_only, false);
  assert.equal(result.code_change, true);
  assert.equal(result.can_use_remote_cache, true);
  assert.equal(result.reason, "app-local-only");
});

test("deleted code plus docs cannot degrade into docs-only no-op", () => {
  const result = classifyPrQualityScope({
    changedFiles: ["packages/ui/src/legacy-button.tsx", "docs/en/guide.md"],
    repoFullName: "org/repo",
    headRepoFullName: "org/repo",
    hasTurboToken: true,
    hasTurboTeam: true,
  });

  assert.equal(result.docs_only, false);
  assert.equal(result.code_change, true);
  assert.equal(result.run_mode, "full");
  assert.equal(result.reason, "shared-or-root-change");
});

test("shared or root diffs force full mode", () => {
  const packageChange = classifyPrQualityScope({
    changedFiles: ["packages/ui/src/components/button.tsx"],
    repoFullName: "org/repo",
    headRepoFullName: "org/repo",
    hasTurboToken: true,
    hasTurboTeam: true,
  });

  assert.equal(packageChange.run_mode, "full");
  assert.equal(packageChange.reason, "shared-or-root-change");

  const workflowChange = classifyPrQualityScope({
    changedFiles: [".github/workflows/pr-quality.yml"],
    repoFullName: "org/repo",
    headRepoFullName: "org/repo",
    hasTurboToken: true,
    hasTurboTeam: true,
  });

  assert.equal(workflowChange.run_mode, "full");
  assert.equal(workflowChange.reason, "shared-or-root-change");
});

test("unknown or unreadable diff falls back to full mode", () => {
  const result = classifyPrQualityScope({
    changedFiles: [],
    repoFullName: "org/repo",
    headRepoFullName: "org/repo",
    hasTurboToken: true,
    hasTurboTeam: true,
    diffAvailable: false,
  });

  assert.equal(result.run_mode, "full");
  assert.equal(result.docs_only, false);
  assert.equal(result.code_change, true);
  assert.equal(result.reason, "diff-unavailable-fallback");
});

test("forks and missing secrets disable remote cache", () => {
  const forkResult = classifyPrQualityScope({
    changedFiles: ["apps/api/src/main.ts"],
    repoFullName: "org/repo",
    headRepoFullName: "someone/repo",
    hasTurboToken: true,
    hasTurboTeam: true,
  });

  assert.equal(forkResult.can_use_remote_cache, false);

  const missingSecretsResult = classifyPrQualityScope({
    changedFiles: ["apps/api/src/main.ts"],
    repoFullName: "org/repo",
    headRepoFullName: "org/repo",
    hasTurboToken: false,
    hasTurboTeam: true,
  });

  assert.equal(missingSecretsResult.can_use_remote_cache, false);
});

test("cli diff reader keeps deleted docs in docs-only classification", (t) => {
  const repoDir = createTempGitRepo();
  t.after(() => rmSync(repoDir, { recursive: true, force: true }));

  writeRepoFile(repoDir, "docs/en/archived.md", "# archived\n");
  const base = commitAll(repoDir, "base");

  unlinkSync(join(repoDir, "docs/en/archived.md"));
  const head = commitAll(repoDir, "delete docs");

  const result = runScopeCli(repoDir, { base, head });

  assert.equal(result.docs_only, true);
  assert.equal(result.code_change, false);
  assert.equal(result.run_mode, "noop");
  assert.equal(result.reason, "docs-only");
  assert.equal(result.changed_files_count, 1);
});

test("cli diff reader keeps deleted code plus docs out of docs-only mode", (t) => {
  const repoDir = createTempGitRepo();
  t.after(() => rmSync(repoDir, { recursive: true, force: true }));

  writeRepoFile(
    repoDir,
    "packages/ui/src/legacy-button.tsx",
    "export const legacy = true;\n",
  );
  writeRepoFile(repoDir, "docs/en/guide.md", "# guide\n");
  const base = commitAll(repoDir, "base");

  unlinkSync(join(repoDir, "packages/ui/src/legacy-button.tsx"));
  writeRepoFile(repoDir, "docs/en/guide.md", "# updated guide\n");
  const head = commitAll(repoDir, "delete code and edit docs");

  const result = runScopeCli(repoDir, { base, head });

  assert.equal(result.docs_only, false);
  assert.equal(result.code_change, true);
  assert.equal(result.run_mode, "full");
  assert.equal(result.reason, "shared-or-root-change");
  assert.equal(result.changed_files_count, 2);
});
