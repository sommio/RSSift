import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import type { Prisma } from "../src/generated/prisma/client";

import {
  createTestPrismaClient,
  prepareTestDatabase,
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
    expect(article.id).toBeTruthy();
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
