import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "@jest/globals";
import request from "supertest";

import { AppModule } from "../src/app.module";
import type { ArticleDetailItemDto } from "../src/articles/dto/article-detail-item.dto";
import type { ArticleListItemDto } from "../src/articles/dto/article-list-item.dto";
import {
  createTestPrismaClient,
  prepareTestDatabase,
} from "../test-support/database";

function asArticleList(body: unknown): ArticleListItemDto[] {
  return body as ArticleListItemDto[];
}

function asArticleDetail(body: unknown): ArticleDetailItemDto {
  return body as ArticleDetailItemDto;
}

let app: INestApplication;
let prisma: ReturnType<typeof createTestPrismaClient>;

async function seedArticlesFixture() {
  await prisma.article.deleteMany();
  await prisma.feed.deleteMany();

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
        publishedAt: new Date("2026-04-15T10:00:00.000Z"),
        sourceId: "guid-1",
        summary:
          "## Title\n\n文章 1\n\n## Summary\n\nSummary 1\n\n## Key Points\n\n1. One",
        summaryErrorReason: "",
        title: "Article 1",
        translatedTitle: "文章 1",
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
}

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
  await seedArticlesFixture();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("Articles endpoints list and detail", () => {
  it("GET /articles returns list payload shape without summary", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get("/articles").expect(200);
    const list = asArticleList(response.body);

    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(2);
    expect(Object.keys(list[0] ?? {}).sort()).toEqual([
      "id",
      "originalUrl",
      "publishedAt",
      "sourceTitle",
      "title",
      "translatedTitle",
    ]);
    expect(list[0]).not.toHaveProperty("contentMarkdown");
    expect(list[0]).not.toHaveProperty("contentExtractedAt");
  });

  it("GET /articles/:id returns detail payload shape", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const listResponse = await request(server).get("/articles").expect(200);
    const list = asArticleList(listResponse.body);
    const targetId = list[0]?.id ?? "";

    const response = await request(server)
      .get(`/articles/${targetId}`)
      .expect(200);
    const detail = asArticleDetail(response.body);

    expect(Object.keys(detail).sort()).toEqual([
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

  it("GET /articles/:id returns empty prepared-summary fields for pending rows", async () => {
    const pending = await prisma.article.findFirstOrThrow({
      where: {
        title: "Article 2",
      },
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .get(`/articles/${pending.id}`)
      .expect(200);
    const detail = asArticleDetail(response.body);

    expect(detail.summary).toBe("");
    expect(detail.summaryErrorReason).toBe("");
    expect(detail.translatedTitle).toBe("");
  });

  it("GET /articles/:id returns persisted summary failure reasons", async () => {
    const failed = await prisma.article.create({
      data: {
        feedId: (await prisma.feed.findFirstOrThrow()).id,
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
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .get(`/articles/${failed.id}`)
      .expect(200);
    const detail = asArticleDetail(response.body);

    expect(detail.summary).toBe("");
    expect(detail.summaryErrorReason).toBe("gateway_timeout");
  });
});

describe("Articles endpoints edge behavior", () => {
  it("GET /articles/:id returns 404 for unknown article id", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server).get("/articles/unknown-article-id").expect(404);
  });

  it("POST /article-content/:id/retry is no longer routable", async () => {
    const article = await prisma.article.findFirstOrThrow({
      orderBy: {
        id: "asc",
      },
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    await request(server)
      .post(`/article-content/${article.id}/retry`)
      .expect(404);
  });

  it("GET /articles keeps working from persisted records only", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get("/articles").expect(200);
    const list = asArticleList(response.body);

    expect(list.every((item) => item.id.startsWith("c"))).toBe(true);
  });
});
