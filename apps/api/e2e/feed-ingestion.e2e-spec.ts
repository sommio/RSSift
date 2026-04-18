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
import type { ArticleSummaryService } from "../src/article-summary/article-summary.service";
import { ArticleIdentityService } from "../src/feeds/article-identity.service";
import { FeedIngestionService } from "../src/feeds/feed-ingestion.service";
import type { PrismaService } from "../src/prisma/prisma.service";
import {
  createTestPrismaClient,
  prepareTestDatabase,
} from "../test-support/database";

function createFeedIngestionService(
  prisma: ReturnType<typeof createTestPrismaClient>,
  articleSummaryService: Pick<ArticleSummaryService, "schedule"> = {
    schedule: () => ({ status: "scheduled" }),
  },
) {
  const articleContentRepository = new ArticleContentRepository(
    prisma as unknown as PrismaService,
  );
  const articleContentService = new ArticleContentService(
    articleContentRepository,
    new ArticleContentExtractionService(),
    articleSummaryService as ArticleSummaryService,
  );

  return new FeedIngestionService(
    prisma as unknown as PrismaService,
    new ArticleIdentityService(),
    articleContentService,
    articleSummaryService as ArticleSummaryService,
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

type E2ESuiteState = {
  prisma: ReturnType<typeof createTestPrismaClient>;
  service: FeedIngestionService;
  tempDir: string;
};

async function setupFeedIngestionSuite(
  state: E2ESuiteState,
  tempPrefix: string,
  articleSummaryService?: Pick<ArticleSummaryService, "schedule">,
) {
  process.env["DATABASE_URL"] ??=
    "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
  process.env["TEST_DATABASE_URL"] ??=
    "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
  process.env["INGEST_ON_BOOT"] = "false";

  await prepareTestDatabase();
  state.prisma = createTestPrismaClient();
  state.service = createFeedIngestionService(
    state.prisma,
    articleSummaryService,
  );
  state.tempDir = mkdtempSync(join(tmpdir(), tempPrefix));
}

async function resetFeedIngestionSuite(state: E2ESuiteState) {
  await state.prisma.article.deleteMany();
  await state.prisma.feed.deleteMany();
  jest.restoreAllMocks();
}

async function teardownFeedIngestionSuite(state: E2ESuiteState) {
  await state.prisma.$disconnect();
  rmSync(state.tempDir, { force: true, recursive: true });
}

describe("Feed ingestion pipeline persistence", () => {
  const state = {} as E2ESuiteState;

  beforeAll(async () => {
    await setupFeedIngestionSuite(state, "rssift-feed-ingestion-");
  });

  beforeEach(async () => {
    await resetFeedIngestionSuite(state);
  });

  afterAll(async () => {
    await teardownFeedIngestionSuite(state);
  });

  it("ingests multiple feeds, isolates one failure, and keeps article ids stable across repeated runs", async () => {
    const opmlPath = writeOpml(
      state.tempDir,
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

    await state.service.ingestFromOpml(opmlPath);
    const firstRun = await state.prisma.article.findMany({
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

    await state.service.ingestFromOpml(opmlPath);

    const secondRun = await state.prisma.article.findMany({
      orderBy: {
        id: "asc",
      },
    });
    const feeds = await state.prisma.feed.findMany({
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

describe("Feed ingestion pipeline fail-open persistence", () => {
  const state = {} as E2ESuiteState;

  beforeAll(async () => {
    await setupFeedIngestionSuite(state, "rssift-feed-ingestion-fail-open-");
  });

  beforeEach(async () => {
    await resetFeedIngestionSuite(state);
  });

  afterAll(async () => {
    await teardownFeedIngestionSuite(state);
  });

  it("fails open when article body extraction fails", async () => {
    const opmlPath = writeOpml(
      state.tempDir,
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

    await state.service.ingestFromOpml(opmlPath);

    const articles = await state.prisma.article.findMany();

    expect(articles).toHaveLength(1);
    expect(articles[0]?.title).toBe("Article A");
    expect(articles[0]?.summary).toBe("");
    expect(articles[0]?.translatedTitle).toBe("");
    expect(articles[0]?.contentMarkdown).toBeNull();
    expect(articles[0]?.contentExtractedAt).toBeNull();
  });

  it("fails open when summary scheduling throws after content persistence", async () => {
    const opmlPath = writeOpml(
      state.tempDir,
      "feeds-summary-schedule-fail-open.opml",
      `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          <outline text="Feed A" xmlUrl="https://example.com/feed-summary-schedule.xml" />
        </body>
      </opml>`,
    );
    state.service = createFeedIngestionService(state.prisma, {
      schedule: () => {
        throw new Error("summary_scheduler_unavailable");
      },
    });

    jest
      .spyOn(global, "fetch")
      .mockImplementation((input: string | URL | Request) => {
        if (
          getFetchUrl(input) === "https://example.com/feed-summary-schedule.xml"
        ) {
          return Promise.resolve(
            new Response(
              `<?xml version="1.0"?>
              <rss version="2.0">
                <channel>
                  <title>Feed A</title>
                  <item>
                    <title>Article A</title>
                    <link>https://example.com/articles/summary-schedule</link>
                    <guid isPermaLink="false">guid-summary-schedule</guid>
                  </item>
                </channel>
              </rss>`,
              { status: 200 },
            ),
          );
        }

        if (
          getFetchUrl(input) === "https://example.com/articles/summary-schedule"
        ) {
          return Promise.resolve(
            new Response(
              `<!doctype html>
              <html>
                <body>
                  <article>
                    <h1>Article A</h1>
                    <p>Persist the body even when summary scheduling fails.</p>
                  </article>
                </body>
              </html>`,
              { status: 200 },
            ),
          );
        }

        return Promise.resolve(new Response("missing", { status: 404 }));
      });

    await state.service.ingestFromOpml(opmlPath);

    const articles = await state.prisma.article.findMany();

    expect(articles).toHaveLength(1);
    expect(articles[0]?.contentMarkdown).toBe(
      "# Article A\n\nPersist the body even when summary scheduling fails.",
    );
    expect(articles[0]?.contentExtractedAt).toBeInstanceOf(Date);
  });
});

describe("Feed ingestion pipeline fail-open recovery", () => {
  const state = {} as E2ESuiteState;

  beforeAll(async () => {
    await setupFeedIngestionSuite(
      state,
      "rssift-feed-ingestion-fail-open-recovery-",
    );
  });

  beforeEach(async () => {
    await resetFeedIngestionSuite(state);
  });

  afterAll(async () => {
    await teardownFeedIngestionSuite(state);
  });

  it("retries automatic enrichment for an existing article that still has no markdown", async () => {
    const opmlPath = writeOpml(
      state.tempDir,
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

    await state.service.ingestFromOpml(opmlPath);

    const firstRun = await state.prisma.article.findMany();

    expect(firstRun).toHaveLength(1);
    expect(firstRun[0]?.contentMarkdown).toBeNull();
    expect(firstRun[0]?.contentExtractedAt).toBeNull();

    await state.service.ingestFromOpml(opmlPath);

    const secondRun = await state.prisma.article.findMany();

    expect(secondRun).toHaveLength(1);
    expect(secondRun[0]?.id).toBe(firstRun[0]?.id);
    expect(secondRun[0]?.contentMarkdown).toBe(
      "# Article Recovery\n\nRecovered on a later ingestion run.",
    );
    expect(secondRun[0]?.contentExtractedAt).toBeInstanceOf(Date);
  });
});
