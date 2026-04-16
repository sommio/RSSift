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

describe("Articles endpoints (e2e)", () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof createTestPrismaClient>;

  beforeAll(async () => {
    process.env["TEST_DATABASE_URL"] ??=
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"];
    process.env["INGEST_ON_BOOT"] ??= "false";

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
          publishedAt: new Date("2026-04-15T10:00:00.000Z"),
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
    await app.close();
    await prisma.$disconnect();
  });

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
    ]);
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
      "title",
    ]);
  });

  it("GET /articles/:id returns 404 for unknown article id", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server).get("/articles/unknown-article-id").expect(404);
  });

  it("GET /articles keeps working from persisted records only", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get("/articles").expect(200);
    const list = asArticleList(response.body);

    expect(list.every((item) => item.id.startsWith("c"))).toBe(true);
  });
});
