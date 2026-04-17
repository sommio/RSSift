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

describe("FeedIngestionService", () => {
  type ExistingArticle = {
    contentMarkdown: string | null;
    id: string;
    sourceId: string | null;
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

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    feedUpsert.mockReset();
    articleFindFirst.mockReset();
    articleUpdate.mockReset();
    articleCreate.mockReset();
    transaction.mockReset();
    tryPersistArticleContent.mockReset();

    transaction.mockImplementation((callback: TransactionCallback) =>
      Promise.resolve(callback(tx)),
    );
    feedUpsert.mockResolvedValue({ id: "feed-1" });
    service = new FeedIngestionService(
      { $transaction: transaction } as unknown as PrismaService,
      new ArticleIdentityService(),
      {
        tryPersistArticleContent,
      } as unknown as ArticleContentService,
    );
    tempDir = mkdtempSync(join(tmpdir(), "rssift-feed-ingestion-spec-"));
  });

  afterEach(() => {
    rmSync(tempDir, { force: true, recursive: true });
    jest.useRealTimers();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("auto-enriches existing articles that are still missing markdown", async () => {
    const opmlPath = writeOpml(
      tempDir,
      "existing-feed.opml",
      `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          <outline text="Feed A" xmlUrl="https://example.com/feed.xml" />
        </body>
      </opml>`,
    );

    articleFindFirst.mockResolvedValue({
      contentMarkdown: null,
      id: "article-existing",
      sourceId: "guid-1",
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
  });

  it("passes the remaining feed budget into article enrichment and stops after exhaustion", async () => {
    const opmlPath = writeOpml(
      tempDir,
      "budget-feed.opml",
      `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          <outline text="Feed A" xmlUrl="https://example.com/feed.xml" />
        </body>
      </opml>`,
    );

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
