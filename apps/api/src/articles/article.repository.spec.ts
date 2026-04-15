import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";

import type { PrismaService } from "../prisma/prisma.service";
import {
  createTestPrismaClient,
  prepareTestDatabase,
} from "../../test/test-db";
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
          ingestedAt: new Date("2026-04-15T10:00:00.000Z"),
          originalUrl: "https://example.com/articles/1",
          publishedAt: new Date("2026-04-14T10:00:00.000Z"),
          sourceId: "guid-1",
          summary: "Summary 1",
          title: "Article 1",
        },
        {
          feedId: feed.id,
          identityHash: "hash-2",
          identitySourceType: "CANONICAL_URL",
          identitySourceValue: "https://example.com/articles/2",
          ingestedAt: new Date("2026-04-15T11:00:00.000Z"),
          originalUrl: "https://example.com/articles/2",
          publishedAt: new Date("2026-04-15T11:00:00.000Z"),
          summary: "",
          title: "Article 2",
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
    expect(detail?.summary).toBe("Summary 1");
    expect(Object.keys(detail ?? {}).sort()).toEqual([
      "id",
      "originalUrl",
      "publishedAt",
      "sourceTitle",
      "summary",
      "title",
    ]);
  });
});
