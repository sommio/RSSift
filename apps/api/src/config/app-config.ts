import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { validateEnv } from "./env.validation";

export type AppConfig = {
  databaseUrl: string;
  feedOpmlPath: string;
  ingestOnBoot: boolean;
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

export function getEnvFilePaths(startDir: string = __dirname) {
  const appPackageRoot = getApiPackageRoot(startDir);

  return [join(appPackageRoot, ".env.local")];
}

export function getAppConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: AppConfigOptions = {},
): AppConfig {
  const validated = validateEnv(env);
  const startDir = options.startDir ?? __dirname;
  const appPackageRoot = getApiPackageRoot(startDir);

  return {
    databaseUrl: validated.DATABASE_URL,
    ...(validated.TEST_DATABASE_URL && {
      testDatabaseUrl: validated.TEST_DATABASE_URL,
    }),
    feedOpmlPath: resolveFeedOpmlPath(appPackageRoot, validated.FEED_OPML_PATH),
    ingestOnBoot: validated.INGEST_ON_BOOT,
    port: validated.PORT,
  };
}
