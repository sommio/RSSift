export type AppEnv = {
  DATABASE_URL: string;
  FEED_AUTO_REFRESH_INTERVAL_HOURS?: number;
  FEED_MAX_ARTICLES_PER_FEED?: number;
  FEED_OPML_PATH?: string;
  INGEST_ON_BOOT: boolean;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_SUMMARY_CONCURRENCY?: number;
  LLM_MODEL?: string;
  LLM_SUMMARY_LANGUAGE: string;
  LLM_TIMEOUT_MS?: number;
  PORT: number;
  TEST_DATABASE_URL?: string;
};

function requireNonEmpty(env: NodeJS.ProcessEnv, key: "DATABASE_URL") {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function optionalNonEmpty(
  env: NodeJS.ProcessEnv,
  key: "LLM_API_KEY" | "LLM_BASE_URL" | "LLM_MODEL" | "TEST_DATABASE_URL",
) {
  const value = env[key]?.trim();

  return value || undefined;
}

function parseBoolean(
  input: string | undefined,
  key: string,
  fallback: boolean,
) {
  if (input === undefined || input.trim() === "") {
    return fallback;
  }

  const normalized = input.trim().toLowerCase();

  if (["1", "true", "yes"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no"].includes(normalized)) {
    return false;
  }

  throw new Error(`${key} must be a boolean`);
}

function parsePort(input: string | undefined) {
  if (input === undefined || input.trim() === "") {
    return 3000;
  }

  const parsed = Number(input);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("PORT must be a positive integer");
  }

  return parsed;
}

function parseOptionalPositiveInteger(input: string | undefined, key: string) {
  if (input === undefined || input.trim() === "") {
    return undefined;
  }

  const parsed = Number(input);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return parsed;
}

export function validateEnv(env: NodeJS.ProcessEnv): AppEnv {
  const databaseUrl = requireNonEmpty(env, "DATABASE_URL");
  const testDatabaseUrl = optionalNonEmpty(env, "TEST_DATABASE_URL");
  const feedAutoRefreshIntervalHours = parseOptionalPositiveInteger(
    env["FEED_AUTO_REFRESH_INTERVAL_HOURS"],
    "FEED_AUTO_REFRESH_INTERVAL_HOURS",
  );
  const feedMaxArticlesPerFeed = parseOptionalPositiveInteger(
    env["FEED_MAX_ARTICLES_PER_FEED"],
    "FEED_MAX_ARTICLES_PER_FEED",
  );
  const feedOpmlPath = env["FEED_OPML_PATH"]?.trim() || undefined;
  const llmApiKey = optionalNonEmpty(env, "LLM_API_KEY");
  const llmBaseUrl = optionalNonEmpty(env, "LLM_BASE_URL");
  const llmModel = optionalNonEmpty(env, "LLM_MODEL");
  const llmSummaryConcurrency = parseOptionalPositiveInteger(
    env["LLM_SUMMARY_CONCURRENCY"],
    "LLM_SUMMARY_CONCURRENCY",
  );
  const llmSummaryLanguage = env["LLM_SUMMARY_LANGUAGE"]?.trim() || "zh-CN";
  const llmTimeoutMs = parseOptionalPositiveInteger(
    env["LLM_TIMEOUT_MS"],
    "LLM_TIMEOUT_MS",
  );

  const appEnv: AppEnv = {
    DATABASE_URL: databaseUrl,
    ...(testDatabaseUrl && { TEST_DATABASE_URL: testDatabaseUrl }),
    ...(feedAutoRefreshIntervalHours && {
      FEED_AUTO_REFRESH_INTERVAL_HOURS: feedAutoRefreshIntervalHours,
    }),
    ...(feedMaxArticlesPerFeed && {
      FEED_MAX_ARTICLES_PER_FEED: feedMaxArticlesPerFeed,
    }),
    INGEST_ON_BOOT: parseBoolean(env["INGEST_ON_BOOT"], "INGEST_ON_BOOT", true),
    ...(llmApiKey && { LLM_API_KEY: llmApiKey }),
    ...(llmBaseUrl && { LLM_BASE_URL: llmBaseUrl }),
    ...(llmModel && { LLM_MODEL: llmModel }),
    ...(llmSummaryConcurrency && {
      LLM_SUMMARY_CONCURRENCY: llmSummaryConcurrency,
    }),
    LLM_SUMMARY_LANGUAGE: llmSummaryLanguage,
    ...(llmTimeoutMs && { LLM_TIMEOUT_MS: llmTimeoutMs }),
    PORT: parsePort(env["PORT"]),
  };

  if (feedOpmlPath) {
    appEnv.FEED_OPML_PATH = feedOpmlPath;
  }

  return appEnv;
}
