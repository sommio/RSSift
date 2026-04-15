export type AppEnv = {
  DATABASE_URL: string;
  FEED_OPML_PATH?: string;
  INGEST_ON_BOOT: boolean;
  PORT: number;
  TEST_DATABASE_URL: string;
};

function requireNonEmpty(
  env: NodeJS.ProcessEnv,
  key: "DATABASE_URL" | "TEST_DATABASE_URL",
) {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
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

export function validateEnv(env: NodeJS.ProcessEnv): AppEnv {
  const databaseUrl = requireNonEmpty(env, "DATABASE_URL");
  const testDatabaseUrl = requireNonEmpty(env, "TEST_DATABASE_URL");
  const feedOpmlPath = env["FEED_OPML_PATH"]?.trim() || undefined;

  const appEnv: AppEnv = {
    DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
    INGEST_ON_BOOT: parseBoolean(env["INGEST_ON_BOOT"], "INGEST_ON_BOOT", true),
    PORT: parsePort(env["PORT"]),
  };

  if (feedOpmlPath) {
    appEnv.FEED_OPML_PATH = feedOpmlPath;
  }

  return appEnv;
}
