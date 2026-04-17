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

import { ArticleContentExtractionService } from "../src/article-content/article-content-extraction.service";
import { ArticleContentRepository } from "../src/article-content/article-content.repository";
import { ArticleContentService } from "../src/article-content/article-content.service";
import { ArticleIdentityService } from "../src/feeds/article-identity.service";
import { FeedIngestionService } from "../src/feeds/feed-ingestion.service";
import type { PrismaService } from "../src/prisma/prisma.service";
import {
  createTestPrismaClient,
  prepareTestDatabase,
} from "../test-support/database";

function createFeedIngestionService(
  prisma: ReturnType<typeof createTestPrismaClient>,
) {
  const articleContentRepository = new ArticleContentRepository(
    prisma as unknown as PrismaService,
  );
  const articleContentService = new ArticleContentService(
    articleContentRepository,
    new ArticleContentExtractionService(),
  );

  return new FeedIngestionService(
    prisma as unknown as PrismaService,
    new ArticleIdentityService(),
    articleContentService,
  );
}

function getFetchUrl(input: string | URL | Request) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function writeOpml(tempDir: string, filename: string, body: string) {
  const opmlPath = join(tempDir, filename);
  writeFileSync(opmlPath, body);
  return opmlPath;
}

describe("Feed ingestion pipeline persistence", () => {
  let prisma: ReturnType<typeof createTestPrismaClient>;
  let service: FeedIngestionService;
  let tempDir: string;

  beforeAll(async () => {
    process.env["DATABASE_URL"] ??=
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    process.env["TEST_DATABASE_URL"] ??=
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    process.env["INGEST_ON_BOOT"] = "false";

    await prepareTestDatabase();
    prisma = createTestPrismaClient();
    service = createFeedIngestionService(prisma);
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
    const opmlPath = writeOpml(
      tempDir,
      "feeds.opml",
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
      [
        "https://example.com/articles/a",
        `<!doctype html>
        <html>
          <body>
            <article>
              <h1>Article A</h1>
              <p>Persist this article body from the primary ingestion path.</p>
            </article>
          </body>
        </html>`,
      ],
    ]);

    jest
      .spyOn(global, "fetch")
      .mockImplementation((input: string | URL | Request) => {
        const body = responses.get(getFetchUrl(input));

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
    expect(firstRun[0]?.contentMarkdown).toBe(
      "# Article A\n\nPersist this article body from the primary ingestion path.",
    );
    expect(firstRun[0]?.contentExtractedAt).toBeInstanceOf(Date);
    expect(firstRun[0]?.identitySourceType).toBe("SOURCE_ID");
    expect(firstRun[0]?.originalUrl).toBe("https://example.com/articles/a");

    await service.ingestFromOpml(opmlPath);

    const secondRun = await prisma.article.findMany({
      orderBy: {
        id: "asc",
      },
    });
    const feeds = await prisma.feed.findMany({
      orderBy: {
        feedUrl: "asc",
      },
    });

    expect(secondRun).toHaveLength(1);
    expect(secondRun[0]?.id).toBe(firstRun[0]?.id);
    expect(feeds).toHaveLength(1);
    expect(feeds[0]?.feedUrl).toBe("https://example.com/feed-a.xml");
  });
});

describe("Feed ingestion pipeline fail-open enrichment", () => {
  let prisma: ReturnType<typeof createTestPrismaClient>;
  let service: FeedIngestionService;
  let tempDir: string;

  beforeAll(async () => {
    process.env["DATABASE_URL"] ??=
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    process.env["TEST_DATABASE_URL"] ??=
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    process.env["INGEST_ON_BOOT"] = "false";

    await prepareTestDatabase();
    prisma = createTestPrismaClient();
    service = createFeedIngestionService(prisma);
    tempDir = mkdtempSync(join(tmpdir(), "rssift-feed-ingestion-fail-open-"));
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

  it("fails open when article body extraction fails", async () => {
    const opmlPath = writeOpml(
      tempDir,
      "feeds-fail-open.opml",
      `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          <outline text="Feed A" xmlUrl="https://example.com/feed-fail-open.xml" />
        </body>
      </opml>`,
    );

    jest
      .spyOn(global, "fetch")
      .mockImplementation((input: string | URL | Request) => {
        if (getFetchUrl(input) === "https://example.com/feed-fail-open.xml") {
          return Promise.resolve(
            new Response(
              `<?xml version="1.0"?>
            <rss version="2.0">
              <channel>
                <title>Feed A</title>
                <item>
                  <title>Article A</title>
                  <link>https://example.com/articles/fail-open</link>
                  <description>Summary A</description>
                  <guid isPermaLink="false">guid-a</guid>
                </item>
              </channel>
            </rss>`,
              { status: 200 },
            ),
          );
        }

        return Promise.resolve(new Response("broken", { status: 500 }));
      });

    await service.ingestFromOpml(opmlPath);

    const articles = await prisma.article.findMany();

    expect(articles).toHaveLength(1);
    expect(articles[0]?.title).toBe("Article A");
    expect(articles[0]?.summary).toBe("Summary A");
    expect(articles[0]?.contentMarkdown).toBeNull();
    expect(articles[0]?.contentExtractedAt).toBeNull();
  });

  it("retries automatic enrichment for an existing article that still has no markdown", async () => {
    const opmlPath = writeOpml(
      tempDir,
      "feeds-recovery.opml",
      `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          <outline text="Feed A" xmlUrl="https://example.com/feed-recovery.xml" />
        </body>
      </opml>`,
    );
    let articleRequestCount = 0;

    jest
      .spyOn(global, "fetch")
      .mockImplementation((input: string | URL | Request) => {
        const url = getFetchUrl(input);

        if (url === "https://example.com/feed-recovery.xml") {
          return Promise.resolve(
            new Response(
              `<?xml version="1.0"?>
              <rss version="2.0">
                <channel>
                  <title>Feed A</title>
                  <item>
                    <title>Article Recovery</title>
                    <link>https://example.com/articles/recovery</link>
                    <description>Summary Recovery</description>
                    <guid isPermaLink="false">guid-recovery</guid>
                  </item>
                </channel>
              </rss>`,
              { status: 200 },
            ),
          );
        }

        if (url === "https://example.com/articles/recovery") {
          articleRequestCount += 1;

          if (articleRequestCount === 1) {
            return Promise.resolve(new Response("broken", { status: 500 }));
          }

          return Promise.resolve(
            new Response(
              `<!doctype html>
              <html>
                <body>
                  <article>
                    <h1>Article Recovery</h1>
                    <p>Recovered on a later ingestion run.</p>
                  </article>
                </body>
              </html>`,
              { status: 200 },
            ),
          );
        }

        return Promise.resolve(new Response("missing", { status: 404 }));
      });

    await service.ingestFromOpml(opmlPath);

    const firstRun = await prisma.article.findMany();

    expect(firstRun).toHaveLength(1);
    expect(firstRun[0]?.contentMarkdown).toBeNull();
    expect(firstRun[0]?.contentExtractedAt).toBeNull();

    await service.ingestFromOpml(opmlPath);

    const secondRun = await prisma.article.findMany();

    expect(secondRun).toHaveLength(1);
    expect(secondRun[0]?.id).toBe(firstRun[0]?.id);
    expect(secondRun[0]?.contentMarkdown).toBe(
      "# Article Recovery\n\nRecovered on a later ingestion run.",
    );
    expect(secondRun[0]?.contentExtractedAt).toBeInstanceOf(Date);
  });
});
