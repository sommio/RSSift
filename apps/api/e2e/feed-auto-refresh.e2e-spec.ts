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
import { FeedAutoRefreshRepository } from "../src/feeds/feed-auto-refresh.repository";
import { FeedAutoRefreshService } from "../src/feeds/feed-auto-refresh.service";
import { ArticleIdentityService } from "../src/feeds/article-identity.service";
import { FeedIngestionService } from "../src/feeds/feed-ingestion.service";
import type { PrismaService } from "../src/prisma/prisma.service";
import {
  createTestPrismaClient,
  prepareTestDatabase,
} from "../test-support/database";

function createFeedXml() {
  return `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <title>Wake Feed</title>
        <item>
          <title>Wake Article</title>
          <link>https://example.com/articles/wake-article</link>
          <description>Wake summary</description>
          <guid isPermaLink="false">wake-guid</guid>
          <pubDate>Tue, 20 Apr 2026 00:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;
}

function createArticleHtml() {
  return `<!doctype html>
    <html>
      <body>
        <article>
          <h1>Wake Article</h1>
          <p>Recovered through the canonical ingestion pipeline.</p>
        </article>
      </body>
    </html>`;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

type FeedAutoRefreshSuiteState = {
  opmlPath: string;
  prisma: ReturnType<typeof createTestPrismaClient>;
  repository: FeedAutoRefreshRepository;
  service: FeedAutoRefreshService;
  ingestionService: FeedIngestionService;
  tempDir: string;
};

function createServices(
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
  const ingestionService = new FeedIngestionService(
    prisma as unknown as PrismaService,
    new ArticleIdentityService(),
    articleContentService,
    articleSummaryService as ArticleSummaryService,
  );
  const repository = new FeedAutoRefreshRepository(
    prisma as unknown as PrismaService,
  );

  return {
    ingestionService,
    repository,
    service: new FeedAutoRefreshService(repository, ingestionService),
  };
}

async function setupSuite(state: FeedAutoRefreshSuiteState) {
  process.env["DATABASE_URL"] ??=
    "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
  process.env["TEST_DATABASE_URL"] ??=
    "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
  process.env["INGEST_ON_BOOT"] = "false";
  process.env["FEED_AUTO_REFRESH_INTERVAL_HOURS"] = "6";

  await prepareTestDatabase();
  state.prisma = createTestPrismaClient();
  state.tempDir = mkdtempSync(join(tmpdir(), "rssift-feed-auto-refresh-e2e-"));
  state.opmlPath = join(state.tempDir, "feeds.opml");
  writeFileSync(
    state.opmlPath,
    `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          <outline text="Wake Feed" xmlUrl="https://example.com/feed-auto-refresh.xml" />
        </body>
      </opml>`,
  );
  process.env["FEED_OPML_PATH"] = state.opmlPath;

  const services = createServices(state.prisma);
  state.ingestionService = services.ingestionService;
  state.repository = services.repository;
  state.service = services.service;
}

async function resetSuite(state: FeedAutoRefreshSuiteState) {
  await state.prisma.article.deleteMany();
  await state.prisma.feed.deleteMany();
  await state.prisma.feedAutoRefreshState.deleteMany();
  state.service.onApplicationShutdown();
  jest.restoreAllMocks();
  jest.useRealTimers();
}

async function teardownSuite(state: FeedAutoRefreshSuiteState) {
  await state.prisma.$disconnect();
  rmSync(state.tempDir, { force: true, recursive: true });
}

async function triggerWakeCheck(state: FeedAutoRefreshSuiteState) {
  const baseMs = Date.parse("2026-04-20T00:00:00.000Z");
  const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(baseMs);
  state.service.onApplicationBootstrap();
  dateNowSpy.mockRestore();
  state.service.onApplicationShutdown();
  await state.service.checkHeartbeat(baseMs + 30_000);
  await state.service.checkHeartbeat(baseMs + 600_000);
}

describe("Feed auto-refresh orchestration", () => {
  const state = {} as FeedAutoRefreshSuiteState;

  beforeAll(async () => {
    await setupSuite(state);
  });

  beforeEach(async () => {
    await resetSuite(state);
  });

  afterAll(async () => {
    await teardownSuite(state);
  });

  it("triggers the first wake-driven refresh when no state row exists yet", async () => {
    jest
      .spyOn(global, "fetch")
      .mockImplementation((input: string | URL | Request) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url === "https://example.com/feed-auto-refresh.xml") {
          return Promise.resolve(
            new Response(createFeedXml(), { status: 200 }),
          );
        }

        if (url === "https://example.com/articles/wake-article") {
          return Promise.resolve(
            new Response(createArticleHtml(), { status: 200 }),
          );
        }

        return Promise.resolve(new Response("missing", { status: 404 }));
      });

    await triggerWakeCheck(state);

    const articles = await state.prisma.article.findMany();
    const refreshState = await state.prisma.feedAutoRefreshState.findUnique({
      where: {
        id: "global",
      },
    });

    expect(articles).toHaveLength(1);
    expect(articles[0]?.contentMarkdown).toBe(
      "# Wake Article\n\nRecovered through the canonical ingestion pipeline.",
    );
    expect(refreshState?.lastSuccessfulAutoRefreshAt?.toISOString()).toBe(
      "2026-04-20T00:10:00.000Z",
    );
  });

  it("re-runs wake refresh when the stored success timestamp is stale", async () => {
    await state.prisma.feedAutoRefreshState.create({
      data: {
        id: "global",
        lastSuccessfulAutoRefreshAt: new Date("2026-04-19T16:00:00.000Z"),
      },
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

        if (url === "https://example.com/feed-auto-refresh.xml") {
          return Promise.resolve(
            new Response(createFeedXml(), { status: 200 }),
          );
        }

        if (url === "https://example.com/articles/wake-article") {
          return Promise.resolve(
            new Response(createArticleHtml(), { status: 200 }),
          );
        }

        return Promise.resolve(new Response("missing", { status: 404 }));
      });

    await triggerWakeCheck(state);

    const refreshState = await state.prisma.feedAutoRefreshState.findUnique({
      where: {
        id: "global",
      },
    });

    expect(await state.prisma.article.count()).toBe(1);
    expect(refreshState?.lastSuccessfulAutoRefreshAt?.toISOString()).toBe(
      "2026-04-20T00:10:00.000Z",
    );
  });

  it("skips wake refresh when the last success timestamp is still fresh", async () => {
    await state.prisma.feedAutoRefreshState.create({
      data: {
        id: "global",
        lastSuccessfulAutoRefreshAt: new Date("2026-04-19T22:30:00.000Z"),
      },
    });
    const fetchSpy = jest.spyOn(global, "fetch");

    await triggerWakeCheck(state);

    const refreshState = await state.prisma.feedAutoRefreshState.findUnique({
      where: {
        id: "global",
      },
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await state.prisma.article.count()).toBe(0);
    expect(refreshState?.lastSuccessfulAutoRefreshAt?.toISOString()).toBe(
      "2026-04-19T22:30:00.000Z",
    );
  });

  it("does not start a duplicate ingestion wave while the first wake-driven run is still active", async () => {
    const deferred = createDeferred<{
      failedCount: number;
      status: "all_success";
      successCount: number;
      totalFeeds: number;
      trigger: "auto_refresh_resume";
    }>();
    const started = createDeferred<undefined>();

    const baseMs = Date.parse("2026-04-20T00:00:00.000Z");
    const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(baseMs);
    state.service.onApplicationBootstrap();
    dateNowSpy.mockRestore();
    state.service.onApplicationShutdown();
    await state.service.checkHeartbeat(baseMs + 30_000);

    const ingestSpy = jest
      .spyOn(state.ingestionService, "ingestFromOpml")
      .mockImplementation(() => {
        started.resolve(undefined);
        return deferred.promise;
      });

    void state.service.checkHeartbeat(baseMs + 600_000);
    await started.promise;
    await state.service.checkHeartbeat(baseMs + 1_200_000);

    expect(ingestSpy).toHaveBeenCalledTimes(1);

    deferred.resolve({
      failedCount: 0,
      status: "all_success",
      successCount: 1,
      totalFeeds: 1,
      trigger: "auto_refresh_resume",
    });
    await Promise.resolve();
  });
});
