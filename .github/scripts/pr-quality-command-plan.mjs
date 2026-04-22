import { appendFileSync } from "node:fs";

export function createPrQualityCommandPlan({
  job,
  docsOnly,
  runMode,
  canUseRemoteCache,
}) {
  if (!["format", "static", "test", "e2e"].includes(job)) {
    throw new Error(`Unsupported job: ${job}`);
  }

  if (docsOnly || runMode === "noop") {
    return {
      should_run: false,
      command: "",
      uses_remote_cache: false,
      reason: "docs-only-noop",
    };
  }

  if (job === "format") {
    return {
      should_run: true,
      command: "pnpm format:check",
      uses_remote_cache: false,
      reason: "full-format-gate",
    };
  }

  if (job === "static") {
    if (runMode === "affected") {
      return {
        should_run: true,
        command:
          "pnpm exec turbo run lint --affected && pnpm exec turbo run typecheck --affected",
        uses_remote_cache: canUseRemoteCache,
        reason: "affected-static-gate",
      };
    }

    return {
      should_run: true,
      command: "pnpm lint && pnpm typecheck",
      uses_remote_cache: canUseRemoteCache,
      reason: "full-static-gate",
    };
  }

  if (job === "test") {
    if (runMode === "affected") {
      return {
        should_run: true,
        command: "pnpm test:root && pnpm exec turbo run test --affected",
        uses_remote_cache: canUseRemoteCache,
        reason: "affected-test-gate",
      };
    }

    return {
      should_run: true,
      command: "pnpm test",
      uses_remote_cache: canUseRemoteCache,
      reason: "full-test-gate",
    };
  }

  return {
    should_run: true,
    command: "pnpm test:e2e",
    uses_remote_cache: canUseRemoteCache,
    reason: "full-e2e-terminal-gate",
  };
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
  const result = createPrQualityCommandPlan({
    job: options.job,
    docsOnly: toBoolean(options["docs-only"] ?? "false"),
    runMode: options["run-mode"] ?? "full",
    canUseRemoteCache: toBoolean(options["can-use-remote-cache"] ?? "false"),
  });

  if (options["github-output"]) {
    writeGitHubOutput(options["github-output"], result);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
