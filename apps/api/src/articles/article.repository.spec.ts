import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";

import type { PrismaService } from "../prisma/prisma.service";
import {
  createTestPrismaClient,
  prepareTestDatabase,
} from "../../test-support/database";
import { ArticleRepository } from "./article.repository";

describe("ArticleRepository", () => {
  let prisma: ReturnType<typeof createTestPrismaClient>;
  let repository: ArticleRepository;

  beforeAll(async () => {
    process.env["DATABASE_URL"] =
      process.env["DATABASE_URL"] ??
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    process.env["TEST_DATABASE_URL"] =
      process.env["TEST_DATABASE_URL"] ??
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";

    await prepareTestDatabase();

    prisma = createTestPrismaClient();
    repository = new ArticleRepository(prisma as unknown as PrismaService);

    const feed = await prisma.feed.create({
      data: {
        feedUrl: "https://example.com/feed.xml",
        siteTitle: "Example feed",
      },
    });

    await prisma.article.createMany({
      data: [
        {
          feedId: feed.id,
          identityHash: "hash-1",
          identitySourceType: "SOURCE_ID",
          identitySourceValue: "guid-1",
          contentExtractedAt: new Date("2026-04-15T10:05:00.000Z"),
          contentMarkdown: "# Article 1\n\nPersisted body",
          ingestedAt: new Date("2026-04-15T10:00:00.000Z"),
          originalUrl: "https://example.com/articles/1",
          publishedAt: new Date("2026-04-14T10:00:00.000Z"),
          sourceId: "guid-1",
          summary:
            "## Title\n\n翻译后的标题 1\n\n## Summary\n\nSummary 1\n\n## Key Points\n\n1. One",
          summaryErrorReason: "",
          title: "Article 1",
          translatedTitle: "翻译后的标题 1",
        },
        {
          feedId: feed.id,
          identityHash: "hash-2",
          identitySourceType: "CANONICAL_URL",
          identitySourceValue: "https://example.com/articles/2",
          ingestedAt: new Date("2026-04-15T11:00:00.000Z"),
          originalUrl: "https://example.com/articles/2",
          publishedAt: new Date("2026-04-15T11:00:00.000Z"),
          summaryErrorReason: "",
          summary: "",
          title: "Article 2",
          translatedTitle: "",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reads list items from persisted records only", async () => {
    const list = await repository.findAll();
    const firstItem = list[0];

    expect(list).toHaveLength(2);
    if (!firstItem) {
      throw new Error("Expected the first persisted article");
    }

    expect(firstItem.title).toBe("Article 1");
    expect(Object.keys(firstItem).sort()).toEqual([
      "id",
      "originalUrl",
      "publishedAt",
      "sourceTitle",
      "title",
      "translatedTitle",
    ]);
  });

  it("returns detail payload and normalizes empty summary", async () => {
    const list = await repository.findAll();
    const firstItem = list[0];

    if (!firstItem) {
      throw new Error("Expected the first persisted article");
    }

    const detail = await repository.findById(firstItem.id);

    expect(detail).not.toBeNull();
    expect(detail?.summary).toBe(
      "## Title\n\n翻译后的标题 1\n\n## Summary\n\nSummary 1\n\n## Key Points\n\n1. One",
    );
    expect(Object.keys(detail ?? {}).sort()).toEqual([
      "id",
      "originalUrl",
      "publishedAt",
      "sourceTitle",
      "summary",
      "summaryErrorReason",
      "title",
      "translatedTitle",
    ]);
    expect(detail).not.toHaveProperty("contentMarkdown");
    expect(detail).not.toHaveProperty("contentExtractedAt");
  });

  it("returns empty translatedTitle and summary for pending summary rows", async () => {
    const list = await repository.findAll();
    const secondItem = list[1];

    if (!secondItem) {
      throw new Error("Expected the second persisted article");
    }

    const detail = await repository.findById(secondItem.id);

    expect(secondItem.translatedTitle).toBe("");
    expect(detail?.translatedTitle).toBe("");
    expect(detail?.summary).toBe("");
    expect(detail?.summaryErrorReason).toBe("");
  });

  it("returns the persisted summary failure reason for failed rows", async () => {
    const feed = await prisma.feed.findFirstOrThrow();
    const failed = await prisma.article.create({
      data: {
        feedId: feed.id,
        identityHash: "hash-3",
        identitySourceType: "SOURCE_ID",
        identitySourceValue: "guid-3",
        ingestedAt: new Date("2026-04-15T12:00:00.000Z"),
        originalUrl: "https://example.com/articles/3",
        publishedAt: new Date("2026-04-15T12:00:00.000Z"),
        sourceId: "guid-3",
        summary: "",
        summaryErrorReason: "gateway_timeout",
        title: "Article 3",
        translatedTitle: "",
      },
    });

    const detail = await repository.findById(failed.id);

    expect(detail?.summary).toBe("");
    expect(detail?.summaryErrorReason).toBe("gateway_timeout");
  });
});
