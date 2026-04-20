import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArticleContentService } from "../article-content/article-content.service";
import type { ArticleSummaryService } from "../article-summary/article-summary.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ArticleIdentityService } from "./article-identity.service";
import { FeedIngestionService } from "./feed-ingestion.service";

function writeOpml(tempDir: string, filename: string, body: string) {
  const opmlPath = join(tempDir, filename);
  writeFileSync(opmlPath, body);
  return opmlPath;
}

function createFeedXml(itemCount = 1) {
  const items = Array.from({ length: itemCount }, (_, index) => {
    const number = index + 1;
    return `
      <item>
        <title>Article ${String(number)}</title>
        <link>https://example.com/articles/${String(number)}</link>
        <description>Summary ${String(number)}</description>
        <guid isPermaLink="false">guid-${String(number)}</guid>
      </item>
    `;
  }).join("");

  return `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <title>Feed A</title>
        ${items}
      </channel>
    </rss>`;
}

function createFeedXmlFromItems(
  items: Array<{ guid: string; publishedAt?: string; title: string }>,
) {
  const xmlItems = items
    .map(
      (item) => `
      <item>
        <title>${item.title}</title>
        <link>https://example.com/articles/${item.guid}</link>
        <description>Summary ${item.guid}</description>
        <guid isPermaLink="false">${item.guid}</guid>
        ${item.publishedAt ? `<pubDate>${item.publishedAt}</pubDate>` : ""}
      </item>
    `,
    )
    .join("");

  return `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <title>Feed A</title>
        ${xmlItems}
      </channel>
    </rss>`;
}

type ExistingArticle = {
  contentMarkdown: string | null;
  id: string;
  summary: string;
  sourceId: string | null;
  title: string;
  translatedTitle: string;
};

type PersistedArticle = {
  id: string;
};

type TransactionClient = {
  article: {
    create: (args: unknown) => Promise<PersistedArticle>;
    findFirst: (args: unknown) => Promise<ExistingArticle | null>;
    update: (args: unknown) => Promise<PersistedArticle>;
  };
  feed: {
    upsert: (args: unknown) => Promise<{ id: string }>;
  };
};

type TransactionCallback = (client: TransactionClient) => unknown;

const articleFindFirst = jest.fn<TransactionClient["article"]["findFirst"]>();
const articleUpdate = jest.fn<TransactionClient["article"]["update"]>();
const articleCreate = jest.fn<TransactionClient["article"]["create"]>();
const feedUpsert = jest.fn<TransactionClient["feed"]["upsert"]>();
const transaction =
  jest.fn<(callback: TransactionCallback) => Promise<unknown>>();
const tryPersistArticleContent =
  jest.fn<ArticleContentService["tryPersistArticleContent"]>();
const scheduleArticleSummary = jest.fn<ArticleSummaryService["schedule"]>();
const tx = {
  article: {
    create: articleCreate,
    findFirst: articleFindFirst,
    update: articleUpdate,
  },
  feed: {
    upsert: feedUpsert,
  },
};

let service: FeedIngestionService;
let tempDir: string;

function createFeedIngestionService() {
  return new FeedIngestionService(
    { $transaction: transaction } as unknown as PrismaService,
    new ArticleIdentityService(),
    {
      tryPersistArticleContent,
    } as unknown as ArticleContentService,
    {
      schedule: scheduleArticleSummary,
    } as unknown as ArticleSummaryService,
  );
}

function resetFeedIngestionSpecState() {
  jest.restoreAllMocks();
  jest.useRealTimers();
  process.env["DATABASE_URL"] =
    "postgresql://rssift:rssift@127.0.0.1:5432/rssift";
  delete process.env["FEED_MAX_ARTICLES_PER_FEED"];
  feedUpsert.mockReset();
  articleFindFirst.mockReset();
  articleUpdate.mockReset();
  articleCreate.mockReset();
  transaction.mockReset();
  tryPersistArticleContent.mockReset();
  scheduleArticleSummary.mockReset();

  transaction.mockImplementation((callback: TransactionCallback) =>
    Promise.resolve(callback(tx)),
  );
  feedUpsert.mockResolvedValue({ id: "feed-1" });
  service = createFeedIngestionService();
  tempDir = mkdtempSync(join(tmpdir(), "rssift-feed-ingestion-spec-"));
}

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { force: true, recursive: true });
  }
  jest.useRealTimers();
});

afterAll(() => {
  jest.restoreAllMocks();
});

function writeSingleFeedOpml(filename: string) {
  return writeFeedOpml(filename, ["https://example.com/feed.xml"]);
}

function writeFeedOpml(filename: string, feedUrls: string[]) {
  const outlines = feedUrls
    .map(
      (feedUrl, index) =>
        `<outline text="Feed ${String(index + 1)}" xmlUrl="${feedUrl}" />`,
    )
    .join("");

  return writeOpml(
    tempDir,
    filename,
    `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          ${outlines}
        </body>
      </opml>`,
  );
}

function createDatedFeedItems(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;

    return {
      guid: `guid-${String(number)}`,
      publishedAt: new Date(Date.UTC(2026, 0, number, 0, 0, 0)).toUTCString(),
      title: `Article ${String(number)}`,
    };
  });
}

describe("FeedIngestionService enrichment timing", () => {
  beforeEach(() => {
    resetFeedIngestionSpecState();
  });

  it("auto-enriches existing articles that are still missing markdown", async () => {
    const opmlPath = writeSingleFeedOpml("existing-feed.opml");

    articleFindFirst.mockResolvedValue({
      contentMarkdown: null,
      id: "article-existing",
      summary: "",
      sourceId: "guid-1",
      title: "Article 1",
      translatedTitle: "",
    });
    articleUpdate.mockResolvedValue({
      id: "article-existing",
    });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(createFeedXml(), { status: 200 }));

    await service.ingestFromOpml(opmlPath);

    expect(articleUpdate).toHaveBeenCalledTimes(1);
    expect(articleCreate).not.toHaveBeenCalled();
    expect(tryPersistArticleContent).toHaveBeenCalledWith(
      "article-existing",
      expect.objectContaining({
        timeoutMs: expect.any(Number),
      }),
    );
    expect(scheduleArticleSummary).not.toHaveBeenCalled();
  });

  it("passes the remaining feed budget into article enrichment and stops after exhaustion", async () => {
    const opmlPath = writeSingleFeedOpml("budget-feed.opml");

    articleFindFirst.mockResolvedValue(null);
    articleCreate
      .mockResolvedValueOnce({ id: "article-1" })
      .mockResolvedValueOnce({ id: "article-2" });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(createFeedXml(2), { status: 200 }));
    tryPersistArticleContent.mockResolvedValue({
      reason: "timed_out",
      status: "failed",
    });
    jest
      .spyOn(Date, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(15_001);

    await service.ingestFromOpml(opmlPath);

    expect(tryPersistArticleContent).toHaveBeenCalledTimes(1);
    expect(tryPersistArticleContent).toHaveBeenCalledWith(
      "article-1",
      expect.objectContaining({
        timeoutMs: expect.any(Number),
      }),
    );

    const [firstCall] = tryPersistArticleContent.mock.calls;
    const [, firstCallOptions = {}] = firstCall ?? [];

    expect(firstCallOptions.timeoutMs).toBeGreaterThan(0);
    expect(firstCallOptions.timeoutMs).toBeLessThanOrEqual(15_000);
  });
});

describe("FeedIngestionService run results and retries", () => {
  beforeEach(() => {
    resetFeedIngestionSpecState();
  });

  it("returns a structured all_success result when every feed succeeds", async () => {
    const opmlPath = writeSingleFeedOpml("all-success.opml");

    articleFindFirst.mockResolvedValue(null);
    articleCreate.mockResolvedValue({
      id: "article-created",
    });
    tryPersistArticleContent.mockResolvedValue({
      status: "succeeded",
    });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(createFeedXml(), { status: 200 }));

    const result = await service.ingestFromOpml(opmlPath);

    expect(result).toEqual({
      failedCount: 0,
      status: "all_success",
      successCount: 1,
      totalFeeds: 1,
      trigger: "bootstrap",
    });
  });

  it("returns partial_success when one feed succeeds and another fails", async () => {
    const opmlPath = writeFeedOpml("partial-success.opml", [
      "https://example.com/feed-a.xml",
      "https://example.com/feed-b.xml",
    ]);

    articleFindFirst.mockResolvedValue(null);
    articleCreate.mockResolvedValue({
      id: "article-created",
    });
    tryPersistArticleContent.mockResolvedValue({
      status: "succeeded",
    });
    jest
      .spyOn(global, "fetch")
      .mockImplementation((input: string | URL | Request) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === "https://example.com/feed-a.xml") {
          return Promise.resolve(
            new Response(createFeedXml().replaceAll("Feed A", "Feed A 1"), {
              status: 200,
            }),
          );
        }

        return Promise.resolve(new Response("unavailable", { status: 500 }));
      });

    const result = await service.ingestFromOpml(opmlPath);

    expect(result).toEqual({
      failedCount: 1,
      status: "partial_success",
      successCount: 1,
      totalFeeds: 2,
      trigger: "bootstrap",
    });
  });

  it("retries retryable failures up to the configured cap", async () => {
    const opmlPath = writeSingleFeedOpml("retryable.opml");

    articleFindFirst.mockResolvedValue(null);
    articleCreate.mockResolvedValue({
      id: "article-created",
    });
    tryPersistArticleContent.mockResolvedValue({
      status: "succeeded",
    });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("server error", { status: 500 }))
      .mockResolvedValueOnce(new Response("server error", { status: 502 }))
      .mockResolvedValueOnce(new Response(createFeedXml(), { status: 200 }));

    const result = await service.ingestFromOpml(opmlPath, {
      maxAttemptsPerFeed: 3,
      trigger: "auto_refresh_resume",
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      failedCount: 0,
      status: "all_success",
      successCount: 1,
      totalFeeds: 1,
      trigger: "auto_refresh_resume",
    });
  });

  it("reports full_failure after exhausting retryable attempts", async () => {
    const opmlPath = writeSingleFeedOpml("retry-cap-exhausted.opml");

    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("server error", { status: 503 }));

    const result = await service.ingestFromOpml(opmlPath, {
      maxAttemptsPerFeed: 3,
      trigger: "auto_refresh_resume",
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      failedCount: 1,
      status: "full_failure",
      successCount: 0,
      totalFeeds: 1,
      trigger: "auto_refresh_resume",
    });
  });

  it("does not retry terminal failures that are not marked retryable", async () => {
    const opmlPath = writeSingleFeedOpml("terminal-failure.opml");

    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("not found", { status: 404 }));

    const result = await service.ingestFromOpml(opmlPath, {
      maxAttemptsPerFeed: 3,
      trigger: "auto_refresh_resume",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      failedCount: 1,
      status: "full_failure",
      successCount: 0,
      totalFeeds: 1,
      trigger: "auto_refresh_resume",
    });
  });
});

describe("FeedIngestionService per-feed article caps", () => {
  beforeEach(() => {
    resetFeedIngestionSpecState();
  });

  it("only persists the latest ten articles from a feed by default", async () => {
    const opmlPath = writeSingleFeedOpml("limited-feed.opml");
    const feedItems = createDatedFeedItems(12);

    articleFindFirst.mockResolvedValue(null);
    articleCreate.mockImplementation((args: unknown) => {
      const data = (args as { data: { sourceId: string } }).data;

      return Promise.resolve({
        id: `article-${data.sourceId}`,
      });
    });
    tryPersistArticleContent.mockResolvedValue({
      status: "succeeded",
    });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(createFeedXmlFromItems(feedItems), { status: 200 }),
      );

    await service.ingestFromOpml(opmlPath);

    expect(articleCreate).toHaveBeenCalledTimes(10);
    expect(tryPersistArticleContent).toHaveBeenCalledTimes(10);

    const createdSourceIds = articleCreate.mock.calls.map((call) => {
      const [args] = call;

      return (args as { data: { sourceId: string } }).data.sourceId;
    });

    expect(createdSourceIds).toEqual([
      "guid-12",
      "guid-11",
      "guid-10",
      "guid-9",
      "guid-8",
      "guid-7",
      "guid-6",
      "guid-5",
      "guid-4",
      "guid-3",
    ]);
  });

  it("respects FEED_MAX_ARTICLES_PER_FEED overrides", async () => {
    process.env["FEED_MAX_ARTICLES_PER_FEED"] = "3";
    service = createFeedIngestionService();

    const opmlPath = writeSingleFeedOpml("override-feed-limit.opml");
    const feedItems = createDatedFeedItems(5);

    articleFindFirst.mockResolvedValue(null);
    articleCreate.mockResolvedValue({
      id: "article-created",
    });
    tryPersistArticleContent.mockResolvedValue({
      status: "succeeded",
    });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(createFeedXmlFromItems(feedItems), { status: 200 }),
      );

    await service.ingestFromOpml(opmlPath);

    expect(articleCreate).toHaveBeenCalledTimes(3);
  });
});

describe("FeedIngestionService summary preservation", () => {
  beforeEach(() => {
    resetFeedIngestionSpecState();
  });

  it("does not overwrite a prepared summary with feed metadata on existing rows", async () => {
    const opmlPath = writeOpml(
      tempDir,
      "prepared-summary-feed.opml",
      `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          <outline text="Feed A" xmlUrl="https://example.com/feed.xml" />
        </body>
      </opml>`,
    );

    articleFindFirst.mockResolvedValue({
      contentMarkdown: "# Existing body",
      id: "article-existing",
      summary:
        "## Title\n\n文章 1\n\n## Summary\n\nPrepared summary\n\n## Key Points\n\n1. One",
      sourceId: "guid-1",
      title: "Article 1",
      translatedTitle: "文章 1",
    });
    articleUpdate.mockResolvedValue({
      id: "article-existing",
    });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(createFeedXml(), { status: 200 }));

    await service.ingestFromOpml(opmlPath);

    expect(articleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          summary: expect.anything(),
        }),
      }),
    );
  });

  it("requeues summary refresh when an enriched article title changes", async () => {
    const opmlPath = writeOpml(
      tempDir,
      "title-refresh-feed.opml",
      `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          <outline text="Feed A" xmlUrl="https://example.com/feed.xml" />
        </body>
      </opml>`,
    );

    articleFindFirst.mockResolvedValue({
      contentMarkdown: "# Existing body",
      id: "article-existing",
      summary:
        "## Title\n\n文章 1\n\n## Summary\n\nPrepared summary\n\n## Key Points\n\n1. One",
      sourceId: "guid-1",
      title: "Old article title",
      translatedTitle: "文章 1",
    });
    articleUpdate.mockResolvedValue({
      id: "article-existing",
    });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(
          createFeedXml().replace("Article 1", "Article 1 updated"),
          { status: 200 },
        ),
      );

    await service.ingestFromOpml(opmlPath);

    expect(scheduleArticleSummary).toHaveBeenCalledWith(
      "article-existing",
      "title_changed",
    );
  });
});
