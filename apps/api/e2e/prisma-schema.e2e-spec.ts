import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import type { Prisma } from "../src/generated/prisma/client";

import {
  getTestDatabaseUrl,
  createTestPrismaClient,
  prepareTestDatabase,
  resetTestDatabase,
} from "../test-support/database";

function createSharedArticleData(feedId: string) {
  return {
    feedId,
    identityHash: "shared-hash",
    identitySourceType: "CANONICAL_URL" as const,
    identitySourceValue: "https://example.com/articles/shared",
    ingestedAt: new Date("2026-04-15T00:00:00.000Z"),
    originalUrl: "https://example.com/articles/shared",
    title: "Shared article",
  };
}

describe("Prisma schema baseline persistence", () => {
  let prisma: ReturnType<typeof createTestPrismaClient>;

  beforeAll(async () => {
    process.env["TEST_DATABASE_URL"] =
      process.env["TEST_DATABASE_URL"] ??
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    await prepareTestDatabase();
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates Feed and Article records with the expected shape", async () => {
    const feed = await prisma.feed.create({
      data: {
        feedUrl: "https://example.com/feed.xml",
        siteTitle: "Example feed",
      },
    });

    const article = await prisma.article.create({
      data: {
        feedId: feed.id,
        identityHash: "hash-1",
        identitySourceType: "SOURCE_ID",
        identitySourceValue: "guid-1",
        contentExtractedAt: new Date("2026-04-15T01:00:00.000Z"),
        contentMarkdown: "# Article 1\n\nBody",
        ingestedAt: new Date("2026-04-15T00:00:00.000Z"),
        originalUrl: "https://example.com/articles/1",
        publishedAt: new Date("2026-04-14T00:00:00.000Z"),
        sourceId: "guid-1",
        summary: "Summary",
        summaryErrorReason: "",
        translatedTitle: "文章 1",
        title: "Article 1",
      },
    });

    expect(feed.feedUrl).toBe("https://example.com/feed.xml");
    expect(article.feedId).toBe(feed.id);
    expect(article.contentMarkdown).toBe("# Article 1\n\nBody");
    expect(article.contentExtractedAt?.toISOString()).toBe(
      "2026-04-15T01:00:00.000Z",
    );
    expect(article.summary).toBe("Summary");
    expect(article.translatedTitle).toBe("文章 1");
    expect(article.id).toBeTruthy();
  });

  it("defaults translatedTitle, summary, and summaryErrorReason to empty strings for pending rows", async () => {
    const feed = await prisma.feed.create({
      data: {
        feedUrl: "https://example.com/pending-summary.xml",
      },
    });

    const article = await prisma.article.create({
      data: {
        feedId: feed.id,
        identityHash: "pending-hash",
        identitySourceType: "SOURCE_ID",
        identitySourceValue: "pending-guid",
        ingestedAt: new Date("2026-04-15T00:00:00.000Z"),
        originalUrl: "https://example.com/articles/pending",
        sourceId: "pending-guid",
        title: "Pending summary article",
      },
    });

    expect(article.summary).toBe("");
    expect(article.summaryErrorReason).toBe("");
    expect(article.translatedTitle).toBe("");
  });

  it("keeps the public article id stable when the same logical row is upserted", async () => {
    const feed = await prisma.feed.create({
      data: {
        feedUrl: "https://example.com/stable-id.xml",
      },
    });

    const created = await prisma.article.create({
      data: {
        feedId: feed.id,
        identityHash: "stable-hash",
        identitySourceType: "SOURCE_ID",
        identitySourceValue: "stable-guid",
        ingestedAt: new Date("2026-04-15T00:00:00.000Z"),
        originalUrl: "https://example.com/articles/stable",
        sourceId: "stable-guid",
        title: "Stable article",
      },
    });

    const updated = await prisma.article.upsert({
      where: {
        feedId_identityHash: {
          feedId: feed.id,
          identityHash: "stable-hash",
        },
      },
      create: {
        feedId: feed.id,
        identityHash: "stable-hash",
        identitySourceType: "SOURCE_ID",
        identitySourceValue: "stable-guid",
        ingestedAt: new Date("2026-04-15T00:00:00.000Z"),
        originalUrl: "https://example.com/articles/stable",
        sourceId: "stable-guid",
        title: "Stable article",
      },
      update: {
        summary: "Updated summary",
      },
    });

    expect(updated.id).toBe(created.id);
    expect(updated.summary).toBe("Updated summary");
  });
});

describe("Article summary migration", () => {
  it("adds translatedTitle and clears legacy summary rows", async () => {
    process.env["TEST_DATABASE_URL"] =
      process.env["TEST_DATABASE_URL"] ??
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    await resetTestDatabase();

    const client = new Client({
      connectionString: getTestDatabaseUrl(),
    });

    const migrationsRoot = join(__dirname, "..", "prisma", "migrations");
    const bootstrapMigration = join(
      migrationsRoot,
      "202604150001_init_feed_ingestion",
      "migration.sql",
    );
    const contentMigration = join(
      migrationsRoot,
      "20260417151547_add_article_content_markdown",
      "migration.sql",
    );
    const summaryMigration = join(
      migrationsRoot,
      "202604180001_add_article_summary_fields",
      "migration.sql",
    );

    expect(existsSync(summaryMigration)).toBe(true);

    await client.connect();

    try {
      await client.query(readFileSync(bootstrapMigration, "utf8"));
      await client.query(readFileSync(contentMigration, "utf8"));
      await client.query(`
        INSERT INTO "Feed" ("id", "feedUrl", "createdAt", "updatedAt")
        VALUES ('feed-migration', 'https://example.com/migration.xml', NOW(), NOW());
      `);
      await client.query(`
        INSERT INTO "Article" (
          "id",
          "feedId",
          "identityHash",
          "identitySourceType",
          "identitySourceValue",
          "ingestedAt",
          "originalUrl",
          "summary",
          "title",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          'article-migration',
          'feed-migration',
          'migration-hash',
          'SOURCE_ID',
          'migration-guid',
          TIMESTAMP '2026-04-15 00:00:00',
          'https://example.com/articles/migration',
          'legacy feed description',
          'Migration article',
          NOW(),
          NOW()
        );
      `);

      await client.query(readFileSync(summaryMigration, "utf8"));

      const result = await client.query<{
        summary: string;
        translatedTitle: string;
      }>(`
        SELECT "summary", "translatedTitle"
        FROM "Article"
        WHERE "id" = 'article-migration'
      `);

      expect(result.rows).toEqual([
        {
          summary: "",
          translatedTitle: "",
        },
      ]);
    } finally {
      await client.end();
    }
  });
});

describe("Article summary error migration", () => {
  it("adds summaryErrorReason with an empty-string default", async () => {
    process.env["TEST_DATABASE_URL"] =
      process.env["TEST_DATABASE_URL"] ??
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    await resetTestDatabase();

    const client = new Client({
      connectionString: getTestDatabaseUrl(),
    });

    const migrationsRoot = join(__dirname, "..", "prisma", "migrations");
    const bootstrapMigration = join(
      migrationsRoot,
      "202604150001_init_feed_ingestion",
      "migration.sql",
    );
    const contentMigration = join(
      migrationsRoot,
      "20260417151547_add_article_content_markdown",
      "migration.sql",
    );
    const summaryMigration = join(
      migrationsRoot,
      "202604180001_add_article_summary_fields",
      "migration.sql",
    );
    const summaryErrorMigration = join(
      migrationsRoot,
      "202604180002_add_article_summary_error_reason",
      "migration.sql",
    );

    expect(existsSync(summaryErrorMigration)).toBe(true);

    await client.connect();

    try {
      await client.query(readFileSync(bootstrapMigration, "utf8"));
      await client.query(readFileSync(contentMigration, "utf8"));
      await client.query(readFileSync(summaryMigration, "utf8"));
      await client.query(readFileSync(summaryErrorMigration, "utf8"));
      await client.query(`
        INSERT INTO "Feed" ("id", "feedUrl", "createdAt", "updatedAt")
        VALUES ('feed-summary-error', 'https://example.com/summary-error.xml', NOW(), NOW());
      `);
      await client.query(`
        INSERT INTO "Article" (
          "id",
          "feedId",
          "identityHash",
          "identitySourceType",
          "identitySourceValue",
          "ingestedAt",
          "originalUrl",
          "title",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          'article-summary-error',
          'feed-summary-error',
          'summary-error-hash',
          'SOURCE_ID',
          'summary-error-guid',
          TIMESTAMP '2026-04-15 00:00:00',
          'https://example.com/articles/summary-error',
          'Summary error article',
          NOW(),
          NOW()
        );
      `);

      const result = await client.query<{ summaryErrorReason: string }>(`
        SELECT "summaryErrorReason"
        FROM "Article"
        WHERE "id" = 'article-summary-error'
      `);

      expect(result.rows).toEqual([
        {
          summaryErrorReason: "",
        },
      ]);
    } finally {
      await client.end();
    }
  });
});

describe("Prisma schema baseline constraints", () => {
  let prisma: ReturnType<typeof createTestPrismaClient>;

  beforeAll(async () => {
    process.env["TEST_DATABASE_URL"] =
      process.env["TEST_DATABASE_URL"] ??
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    await prepareTestDatabase();
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects duplicate feedUrl values", async () => {
    await prisma.feed.create({
      data: {
        feedUrl: "https://example.com/duplicate.xml",
      },
    });

    await expect(
      prisma.feed.create({
        data: {
          feedUrl: "https://example.com/duplicate.xml",
        },
      }),
    ).rejects.toMatchObject({
      code: "P2002",
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });

  it("rejects duplicate identityHash within a feed and allows it across feeds", async () => {
    const [feedA, feedB] = await Promise.all([
      prisma.feed.create({
        data: { feedUrl: "https://example.com/feed-a.xml" },
      }),
      prisma.feed.create({
        data: { feedUrl: "https://example.com/feed-b.xml" },
      }),
    ]);

    await prisma.article.create({
      data: createSharedArticleData(feedA.id),
    });

    await expect(
      prisma.article.create({
        data: createSharedArticleData(feedA.id),
      }),
    ).rejects.toMatchObject({
      code: "P2002",
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);

    const articleOnSecondFeed = await prisma.article.create({
      data: createSharedArticleData(feedB.id),
    });

    expect(articleOnSecondFeed.feedId).toBe(feedB.id);
  });
});
