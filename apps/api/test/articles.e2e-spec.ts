import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";

import { AppModule } from "./../src/app.module";
import type { ArticleDetailItemDto } from "./../src/articles/dto/article-detail-item.dto";
import type { ArticleListItemDto } from "./../src/articles/dto/article-list-item.dto";

function asArticleList(body: unknown): ArticleListItemDto[] {
  return body as ArticleListItemDto[];
}

function asArticleDetail(body: unknown): ArticleDetailItemDto {
  return body as ArticleDetailItemDto;
}

describe("Articles endpoints (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /articles returns list payload shape without summary", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get("/articles").expect(200);
    const list = asArticleList(response.body);

    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(1);
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

  it("GET /health is no longer exposed", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    await request(server).get("/health").expect(404);
  });
});
