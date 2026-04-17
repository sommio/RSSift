import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import request from "supertest";

import { AppModule } from "../src/app.module";
import {
  createTestPrismaClient,
  prepareTestDatabase,
} from "../test-support/database";

describe("Article content retry endpoint (e2e)", () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createTestPrismaClient>;

  beforeAll(async () => {
    process.env["TEST_DATABASE_URL"] ??=
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"];
    process.env["INGEST_ON_BOOT"] = "false";

    await prepareTestDatabase();
    prisma = createTestPrismaClient();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await prisma.article.deleteMany();
    await prisma.feed.deleteMany();
    jest.restoreAllMocks();

    const feed = await prisma.feed.create({
      data: {
        feedUrl: "https://example.com/feed.xml",
        siteTitle: "Example feed",
      },
    });

    await prisma.article.create({
      data: {
        contentMarkdown: "# Old content",
        feedId: feed.id,
        identityHash: "hash-1",
        identitySourceType: "SOURCE_ID",
        identitySourceValue: "guid-1",
        ingestedAt: new Date("2026-04-15T10:00:00.000Z"),
        originalUrl: "https://example.com/articles/1",
        publishedAt: new Date("2026-04-15T10:00:00.000Z"),
        sourceId: "guid-1",
        summary: "Summary 1",
        title: "Article 1",
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("retries extraction for a single article and persists refreshed markdown", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        `<!doctype html>
        <html>
          <body>
            <article>
              <h1>Article 1</h1>
              <p>Freshly retried body content for this article.</p>
            </article>
          </body>
        </html>`,
        { status: 200 },
      ),
    );

    const article = await prisma.article.findFirstOrThrow({
      orderBy: {
        id: "asc",
      },
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post(`/article-content/${article.id}/retry`)
      .expect(200);

    expect(response.body).toEqual({
      status: "succeeded",
    });

    const updated = await prisma.article.findUniqueOrThrow({
      where: {
        id: article.id,
      },
    });

    expect(updated.contentMarkdown).toBe(
      "# Article 1\n\nFreshly retried body content for this article.",
    );
    expect(updated.contentExtractedAt).toBeInstanceOf(Date);
  });

  it("returns 404 for an unknown article id", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post("/article-content/unknown-article-id/retry")
      .expect(404);
  });
});
