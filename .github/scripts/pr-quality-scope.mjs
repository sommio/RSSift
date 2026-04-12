import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const DOCS_ONLY_PATTERNS = [
  /^docs\//,
  /^README(?:\.[A-Za-z0-9-]+)?\.md$/,
  /^LICENSE$/,
  /^.+\.mdx?$/,
];

const APP_LOCAL_PATTERN = /^apps\/[A-Za-z0-9_-]+\//;

export function isDocsOnlyPath(filePath) {
  return DOCS_ONLY_PATTERNS.some((pattern) => pattern.test(String(filePath)));
}

export function isAppLocalPath(filePath) {
  return APP_LOCAL_PATTERN.test(String(filePath));
}

export function classifyPrQualityScope({
  changedFiles,
  repoFullName,
  headRepoFullName,
  hasTurboToken,
  hasTurboTeam,
  diffAvailable = true,
}) {
  if (
    !diffAvailable ||
    !Array.isArray(changedFiles) ||
    changedFiles.length === 0
  ) {
    return {
      docs_only: false,
      code_change: true,
      run_mode: "full",
      can_use_remote_cache: Boolean(
        repoFullName &&
        headRepoFullName &&
        repoFullName === headRepoFullName &&
        hasTurboToken &&
        hasTurboTeam,
      ),
      reason: diffAvailable
        ? "empty-diff-fallback"
        : "diff-unavailable-fallback",
      changed_files_count: Array.isArray(changedFiles)
        ? changedFiles.length
        : 0,
    };
  }

  const normalizedFiles = changedFiles
    .map((filePath) =>
      String(filePath).replace(/^\.\//, "").replace(/\\/g, "/").trim(),
    )
    .filter(Boolean);

  const docsOnly = normalizedFiles.every((filePath) =>
    isDocsOnlyPath(filePath),
  );
  const hasAppLocalChanges = normalizedFiles.some((filePath) =>
    isAppLocalPath(filePath),
  );
  const onlyDocsAndApps = normalizedFiles.every(
    (filePath) => isDocsOnlyPath(filePath) || isAppLocalPath(filePath),
  );

  let runMode = "full";
  let codeChange = true;
  let reason = "shared-or-root-change";

  if (docsOnly) {
    runMode = "noop";
    codeChange = false;
    reason = "docs-only";
  } else if (hasAppLocalChanges && onlyDocsAndApps) {
    runMode = "affected";
    reason = "app-local-only";
  }

  return {
    docs_only: docsOnly,
    code_change: codeChange,
    run_mode: runMode,
    can_use_remote_cache: Boolean(
      repoFullName &&
      headRepoFullName &&
      repoFullName === headRepoFullName &&
      hasTurboToken &&
      hasTurboTeam,
    ),
    reason,
    changed_files_count: normalizedFiles.length,
  };
}

function readChangedFiles({ base, head }) {
  const stdout = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMRD", `${base}...${head}`],
    { encoding: "utf8" },
  );

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const nextValue = argv[index + 1];

    if (!nextValue || nextValue.startsWith("--")) {
      options[key] = "true";
      continue;
    }

    options[key] = nextValue;
    index += 1;
  }

  return options;
}

function toBoolean(value) {
  return value === "true";
}

function writeGitHubOutput(filePath, result) {
  const lines = Object.entries(result).map(([key, value]) => `${key}=${value}`);

  for (const line of lines) {
    appendFileSync(filePath, `${line}\n`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoFullName =
    options["repo-full-name"] ?? process.env.GITHUB_REPOSITORY ?? "";
  const headRepoFullName =
    options["head-repo-full-name"] ??
    process.env.PR_HEAD_REPO_FULL_NAME ??
    repoFullName;
  const hasTurboToken = toBoolean(
    options["has-turbo-token"] ?? process.env.HAS_TURBO_TOKEN ?? "false",
  );
  const hasTurboTeam = toBoolean(
    options["has-turbo-team"] ?? process.env.HAS_TURBO_TEAM ?? "false",
  );

  let changedFiles = [];
  let diffAvailable = true;

  try {
    if (options["changed-files-json"]) {
      changedFiles = JSON.parse(options["changed-files-json"]);
    } else if (options.base && options.head) {
      changedFiles = readChangedFiles({
        base: options.base,
        head: options.head,
      });
    } else {
      diffAvailable = false;
    }
  } catch {
    diffAvailable = false;
  }

  const result = classifyPrQualityScope({
    changedFiles,
    repoFullName,
    headRepoFullName,
    hasTurboToken,
    hasTurboTeam,
    diffAvailable,
  });

  if (options["github-output"]) {
    writeGitHubOutput(options["github-output"], result);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
