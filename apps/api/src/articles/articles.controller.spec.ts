import { Test } from "@nestjs/testing";
import { describe, expect, it } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";

import { ArticleFixtureRepository } from "./article-fixture.repository";
import { ArticlesController } from "./articles.controller";
import { ArticlesService } from "./articles.service";

describe("ArticlesController", () => {
  it("returns list payload without summary", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ArticlesController],
      providers: [ArticlesService, ArticleFixtureRepository],
    }).compile();

    const controller = moduleRef.get(ArticlesController);
    const payload = controller.getArticles();

    expect(payload.length).toBeGreaterThan(1);
    expect(Object.keys(payload[0] ?? {}).sort()).toEqual([
      "id",
      "originalUrl",
      "publishedAt",
      "sourceTitle",
      "title",
    ]);
  });

  it("returns detail payload for an existing article id", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ArticlesController],
      providers: [ArticlesService, ArticleFixtureRepository],
    }).compile();

    const controller = moduleRef.get(ArticlesController);
    const articles = controller.getArticles();
    const detail = controller.getArticleById(articles[0]?.id ?? "");

    expect(Object.keys(detail).sort()).toEqual([
      "originalUrl",
      "publishedAt",
      "sourceTitle",
      "summary",
      "title",
    ]);
  });

  it("throws NotFoundException for unknown article id", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ArticlesController],
      providers: [ArticlesService, ArticleFixtureRepository],
    }).compile();

    const controller = moduleRef.get(ArticlesController);

    expect(() => controller.getArticleById("does-not-exist")).toThrow(
      NotFoundException,
    );
  });
});
