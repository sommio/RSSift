import { describe, expect, it } from "@jest/globals";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getAppConfig } from "./app-config";

function createApiRoot() {
  const root = join(
    tmpdir(),
    `rss-start-api-config-${String(Date.now())}-${Math.random().toString(16).slice(2)}`,
  );

  mkdirSync(join(root, "src", "config"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "api" }));

  return root;
}

describe("getAppConfig", () => {
  it("returns app-owned config with the default feeds.opml path", () => {
    const apiRoot = createApiRoot();

    try {
      const config = getAppConfig(
        {
          DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
          TEST_DATABASE_URL:
            "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test",
          INGEST_ON_BOOT: "false",
        },
        { startDir: join(apiRoot, "src", "config") },
      );

      expect(config.databaseUrl).toBe(
        "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
      );
      expect(config.testDatabaseUrl).toBe(
        "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test",
      );
      expect(config.ingestOnBoot).toBe(false);
      expect(config.feedOpmlPath).toBe(join(apiRoot, "feeds.opml"));
      expect(config.port).toBe(3000);
    } finally {
      rmSync(apiRoot, { force: true, recursive: true });
    }
  });

  it("uses an explicit FEED_OPML_PATH relative to the api package root", () => {
    const apiRoot = createApiRoot();

    try {
      const config = getAppConfig(
        {
          DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
          TEST_DATABASE_URL:
            "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test",
          FEED_OPML_PATH: "./fixtures/custom.opml",
        },
        { startDir: join(apiRoot, "dist", "src", "config") },
      );

      expect(config.feedOpmlPath).toBe(
        join(apiRoot, "fixtures", "custom.opml"),
      );
      expect(config.ingestOnBoot).toBe(true);
    } finally {
      rmSync(apiRoot, { force: true, recursive: true });
    }
  });

  it("fails fast when DATABASE_URL is missing", () => {
    expect(() =>
      getAppConfig({
        TEST_DATABASE_URL:
          "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test",
      }),
    ).toThrow("Missing required environment variable: DATABASE_URL");
  });

  it("fails fast when TEST_DATABASE_URL is missing", () => {
    expect(() =>
      getAppConfig({
        DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
      }),
    ).toThrow("Missing required environment variable: TEST_DATABASE_URL");
  });

  it("rejects invalid INGEST_ON_BOOT values", () => {
    expect(() =>
      getAppConfig({
        DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
        TEST_DATABASE_URL:
          "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test",
        INGEST_ON_BOOT: "sometimes",
      }),
    ).toThrow("INGEST_ON_BOOT must be a boolean");
  });
});
