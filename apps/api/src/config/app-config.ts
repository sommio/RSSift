import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { validateEnv } from "./env.validation";

const DEFAULT_FEED_MAX_ARTICLES_PER_FEED = 10;
const DEFAULT_FEED_AUTO_REFRESH_INTERVAL_HOURS = 6;
const DEFAULT_LLM_SUMMARY_CONCURRENCY = 2;

export type AppConfig = {
  databaseUrl: string;
  feedAutoRefreshIntervalHours: number;
  feedMaxArticlesPerFeed: number;
  feedOpmlPath: string;
  ingestOnBoot: boolean;
  llmSummary?: {
    apiKey: string;
    baseUrl: string;
    concurrency: number;
    language: string;
    model: string;
    timeoutMs?: number;
  };
  port: number;
  testDatabaseUrl?: string;
};

type AppConfigOptions = {
  startDir?: string;
};

type PackageManifest = {
  name?: string;
};

function readPackageManifest(candidatePath: string): PackageManifest | null {
  if (!existsSync(candidatePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(candidatePath, "utf8")) as PackageManifest;
  } catch {
    return null;
  }
}

export function getApiPackageRoot(startDir: string = __dirname) {
  let currentDir = resolve(startDir);
  const root = resolve(currentDir, "/");

  for (;;) {
    const manifest = readPackageManifest(join(currentDir, "package.json"));

    if (manifest?.name === "api") {
      return currentDir;
    }

    if (currentDir === root) {
      throw new Error(
        `Failed to resolve the apps/api package root from ${startDir}`,
      );
    }

    currentDir = dirname(currentDir);
  }
}

function resolveFeedOpmlPath(
  appPackageRoot: string,
  configuredPath: string | undefined,
) {
  if (!configuredPath) {
    return join(appPackageRoot, "feeds.opml");
  }

  if (isAbsolute(configuredPath)) {
    return configuredPath;
  }

  return resolve(appPackageRoot, configuredPath);
}

function resolveLlmSummaryConfig(validated: ReturnType<typeof validateEnv>) {
  if (
    !validated.LLM_API_KEY ||
    !validated.LLM_BASE_URL ||
    !validated.LLM_MODEL
  ) {
    return undefined;
  }

  return {
    apiKey: validated.LLM_API_KEY,
    baseUrl: validated.LLM_BASE_URL,
    concurrency:
      validated.LLM_SUMMARY_CONCURRENCY ?? DEFAULT_LLM_SUMMARY_CONCURRENCY,
    language: validated.LLM_SUMMARY_LANGUAGE,
    model: validated.LLM_MODEL,
    ...(validated.LLM_TIMEOUT_MS && {
      timeoutMs: validated.LLM_TIMEOUT_MS,
    }),
  };
}

export function getEnvFilePaths(startDir: string = __dirname) {
  const appPackageRoot = getApiPackageRoot(startDir);

  return [join(appPackageRoot, ".env.local")];
}

export function getAppConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: AppConfigOptions = {},
): AppConfig {
  const validated = validateEnv(env);
  const llmSummary = resolveLlmSummaryConfig(validated);
  const startDir = options.startDir ?? __dirname;
  const appPackageRoot = getApiPackageRoot(startDir);

  return {
    databaseUrl: validated.DATABASE_URL,
    ...(validated.TEST_DATABASE_URL && {
      testDatabaseUrl: validated.TEST_DATABASE_URL,
    }),
    feedAutoRefreshIntervalHours:
      validated.FEED_AUTO_REFRESH_INTERVAL_HOURS ??
      DEFAULT_FEED_AUTO_REFRESH_INTERVAL_HOURS,
    feedMaxArticlesPerFeed:
      validated.FEED_MAX_ARTICLES_PER_FEED ??
      DEFAULT_FEED_MAX_ARTICLES_PER_FEED,
    feedOpmlPath: resolveFeedOpmlPath(appPackageRoot, validated.FEED_OPML_PATH),
    ingestOnBoot: validated.INGEST_ON_BOOT,
    ...(llmSummary && { llmSummary }),
    port: validated.PORT,
  };
}
