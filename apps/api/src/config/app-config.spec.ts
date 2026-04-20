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

describe("getAppConfig defaults and paths", () => {
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
      expect(config.feedAutoRefreshIntervalHours).toBe(6);
      expect(config.feedMaxArticlesPerFeed).toBe(10);
      expect(config.ingestOnBoot).toBe(false);
      expect(config.feedOpmlPath).toBe(join(apiRoot, "feeds.opml"));
      expect(config.llmSummary).toBeUndefined();
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
      expect(config.feedAutoRefreshIntervalHours).toBe(6);
      expect(config.feedMaxArticlesPerFeed).toBe(10);
      expect(config.ingestOnBoot).toBe(true);
      expect(config.llmSummary).toBeUndefined();
    } finally {
      rmSync(apiRoot, { force: true, recursive: true });
    }
  });

  it("accepts an explicit per-feed article cap", () => {
    const apiRoot = createApiRoot();

    try {
      const config = getAppConfig(
        {
          DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
          FEED_MAX_ARTICLES_PER_FEED: "25",
        },
        { startDir: join(apiRoot, "src", "config") },
      );

      expect(config.feedMaxArticlesPerFeed).toBe(25);
    } finally {
      rmSync(apiRoot, { force: true, recursive: true });
    }
  });

  it("accepts an explicit wake auto-refresh interval override", () => {
    const apiRoot = createApiRoot();

    try {
      const config = getAppConfig(
        {
          DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
          FEED_AUTO_REFRESH_INTERVAL_HOURS: "12",
          INGEST_ON_BOOT: "false",
        },
        { startDir: join(apiRoot, "src", "config") },
      );

      expect(config.feedAutoRefreshIntervalHours).toBe(12);
      expect(config.ingestOnBoot).toBe(false);
    } finally {
      rmSync(apiRoot, { force: true, recursive: true });
    }
  });
});

describe("getAppConfig llm summary settings", () => {
  it("builds llm summary config and defaults language to zh-CN", () => {
    const apiRoot = createApiRoot();

    try {
      const config = getAppConfig(
        {
          DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
          LLM_API_KEY: "test-key",
          LLM_BASE_URL: "https://llm-gateway.example.com/v1",
          LLM_MODEL: "gpt-4.1-mini",
        },
        { startDir: join(apiRoot, "src", "config") },
      );

      expect(config.llmSummary).toEqual({
        apiKey: "test-key",
        baseUrl: "https://llm-gateway.example.com/v1",
        concurrency: 2,
        language: "zh-CN",
        model: "gpt-4.1-mini",
      });
    } finally {
      rmSync(apiRoot, { force: true, recursive: true });
    }
  });

  it("accepts optional llm summary timeout, concurrency, and explicit language", () => {
    const apiRoot = createApiRoot();

    try {
      const config = getAppConfig(
        {
          DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
          LLM_API_KEY: "test-key",
          LLM_BASE_URL: "https://llm-gateway.example.com/v1",
          LLM_MODEL: "gpt-4.1-mini",
          LLM_SUMMARY_CONCURRENCY: "1",
          LLM_SUMMARY_LANGUAGE: "en-US",
          LLM_TIMEOUT_MS: "12000",
        },
        { startDir: join(apiRoot, "src", "config") },
      );

      expect(config.llmSummary).toEqual({
        apiKey: "test-key",
        baseUrl: "https://llm-gateway.example.com/v1",
        concurrency: 1,
        language: "en-US",
        model: "gpt-4.1-mini",
        timeoutMs: 12000,
      });
    } finally {
      rmSync(apiRoot, { force: true, recursive: true });
    }
  });

  it("does not fail startup when llm config is missing", () => {
    const apiRoot = createApiRoot();

    try {
      const config = getAppConfig(
        {
          DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
          LLM_BASE_URL: "https://llm-gateway.example.com/v1",
        },
        { startDir: join(apiRoot, "src", "config") },
      );

      expect(config.llmSummary).toBeUndefined();
    } finally {
      rmSync(apiRoot, { force: true, recursive: true });
    }
  });
});

describe("getAppConfig validation", () => {
  it("fails fast when DATABASE_URL is missing", () => {
    expect(() =>
      getAppConfig({
        TEST_DATABASE_URL:
          "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test",
      }),
    ).toThrow("Missing required environment variable: DATABASE_URL");
  });

  it("omits testDatabaseUrl when TEST_DATABASE_URL is not set", () => {
    const apiRoot = createApiRoot();

    try {
      const config = getAppConfig(
        {
          DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
        },
        { startDir: join(apiRoot, "src", "config") },
      );

      expect(config.databaseUrl).toBe(
        "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
      );
      expect(config.llmSummary).toBeUndefined();
      expect(config.testDatabaseUrl).toBeUndefined();
    } finally {
      rmSync(apiRoot, { force: true, recursive: true });
    }
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

  it("rejects invalid FEED_MAX_ARTICLES_PER_FEED values", () => {
    expect(() =>
      getAppConfig({
        DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
        FEED_MAX_ARTICLES_PER_FEED: "0",
      }),
    ).toThrow("FEED_MAX_ARTICLES_PER_FEED must be a positive integer");
  });

  it("rejects invalid FEED_AUTO_REFRESH_INTERVAL_HOURS values", () => {
    expect(() =>
      getAppConfig({
        DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
        FEED_AUTO_REFRESH_INTERVAL_HOURS: "0",
      }),
    ).toThrow("FEED_AUTO_REFRESH_INTERVAL_HOURS must be a positive integer");
  });

  it("rejects invalid LLM_TIMEOUT_MS values", () => {
    expect(() =>
      getAppConfig({
        DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
        LLM_TIMEOUT_MS: "-1",
      }),
    ).toThrow("LLM_TIMEOUT_MS must be a positive integer");
  });

  it("rejects invalid LLM_SUMMARY_CONCURRENCY values", () => {
    expect(() =>
      getAppConfig({
        DATABASE_URL: "postgresql://rssift:rssift@127.0.0.1:5432/rssift",
        LLM_SUMMARY_CONCURRENCY: "0",
      }),
    ).toThrow("LLM_SUMMARY_CONCURRENCY must be a positive integer");
  });
});
