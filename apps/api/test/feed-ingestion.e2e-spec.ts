import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PrismaService } from "../src/prisma/prisma.service";
import { ArticleIdentityService } from "../src/feeds/article-identity.service";
import { FeedIngestionService } from "../src/feeds/feed-ingestion.service";
import { createTestPrismaClient, prepareTestDatabase } from "./test-db";

describe("Feed ingestion pipeline", () => {
  let prisma: ReturnType<typeof createTestPrismaClient>;
  let service: FeedIngestionService;
  let tempDir: string;

  beforeAll(async () => {
    process.env["DATABASE_URL"] =
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    process.env["TEST_DATABASE_URL"] =
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    process.env["INGEST_ON_BOOT"] = "false";

    await prepareTestDatabase();
    prisma = createTestPrismaClient();
    service = new FeedIngestionService(
      prisma as unknown as PrismaService,
      new ArticleIdentityService(),
    );
    tempDir = mkdtempSync(join(tmpdir(), "rssift-feed-ingestion-"));
  });

  beforeEach(async () => {
    await prisma.article.deleteMany();
    await prisma.feed.deleteMany();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    rmSync(tempDir, { force: true, recursive: true });
  });

  it("ingests multiple feeds, isolates one failure, and keeps article ids stable across repeated runs", async () => {
    const opmlPath = join(tempDir, "feeds.opml");
    writeFileSync(
      opmlPath,
      `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          <outline text="Feed A" xmlUrl="https://example.com/feed-a.xml" />
          <outline text="Feed B" xmlUrl="https://example.com/feed-b.xml" />
        </body>
      </opml>`,
    );

    const responses = new Map<string, string>([
      [
        "https://example.com/feed-a.xml",
        `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Feed A</title>
            <link>https://example.com</link>
            <item>
              <title>Article A</title>
              <link>https://example.com/articles/a#fragment</link>
              <description>Summary A</description>
              <guid isPermaLink="false">guid-a</guid>
              <pubDate>Tue, 15 Apr 2026 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`,
      ],
    ]);

    jest
      .spyOn(global, "fetch")
      .mockImplementation((input: string | URL | Request) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const body = responses.get(url);

        if (!body) {
          return Promise.resolve(new Response("broken", { status: 500 }));
        }

        return Promise.resolve(
          new Response(body, {
            status: 200,
            headers: {
              etag: "etag-value",
              "last-modified": "Tue, 15 Apr 2026 12:00:00 GMT",
            },
          }),
        );
      });

    await service.ingestFromOpml(opmlPath);
    const firstRun = await prisma.article.findMany({
      orderBy: {
        id: "asc",
      },
    });

    expect(firstRun).toHaveLength(1);
    expect(firstRun[0]?.identitySourceType).toBe("SOURCE_ID");
    expect(firstRun[0]?.originalUrl).toBe("https://example.com/articles/a");

    await service.ingestFromOpml(opmlPath);

    const secondRun = await prisma.article.findMany({
      orderBy: {
        id: "asc",
      },
    });

    expect(secondRun).toHaveLength(1);
    expect(secondRun[0]?.id).toBe(firstRun[0]?.id);

    const feeds = await prisma.feed.findMany({
      orderBy: {
        feedUrl: "asc",
      },
    });

    expect(feeds).toHaveLength(1);
    expect(feeds[0]?.feedUrl).toBe("https://example.com/feed-a.xml");
  });
});
