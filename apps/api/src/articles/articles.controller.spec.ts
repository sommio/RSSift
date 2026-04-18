import { Test } from "@nestjs/testing";
import { describe, expect, it, jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";

import { ArticlesController } from "./articles.controller";
import { ArticlesService } from "./articles.service";

describe("ArticlesController", () => {
  it("returns list payload without summary", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ArticlesController],
      providers: [
        {
          provide: ArticlesService,
          useValue: {
            getArticles: jest.fn<() => Promise<Array<Record<string, string>>>>(
              () =>
                Promise.resolve([
                  {
                    id: "article-1",
                    originalUrl: "https://example.com/articles/1",
                    publishedAt: "2026-04-15T00:00:00.000Z",
                    sourceTitle: "Example feed",
                    title: "Article 1",
                    translatedTitle: "文章 1",
                  },
                ]),
            ),
          },
        },
      ],
    }).compile();

    const controller = moduleRef.get(ArticlesController);
    const payload = await controller.getArticles();

    expect(payload.length).toBe(1);
    expect(Object.keys(payload[0] ?? {}).sort()).toEqual([
      "id",
      "originalUrl",
      "publishedAt",
      "sourceTitle",
      "title",
      "translatedTitle",
    ]);
  });

  it("returns detail payload for an existing article id", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ArticlesController],
      providers: [
        {
          provide: ArticlesService,
          useValue: {
            getArticleById: jest.fn<() => Promise<Record<string, string>>>(() =>
              Promise.resolve({
                originalUrl: "https://example.com/articles/1",
                publishedAt: "2026-04-15T00:00:00.000Z",
                sourceTitle: "Example feed",
                summary: "Summary",
                summaryErrorReason: "",
                title: "Article 1",
                translatedTitle: "文章 1",
              }),
            ),
          },
        },
      ],
    }).compile();

    const controller = moduleRef.get(ArticlesController);
    const detail = await controller.getArticleById("article-1");

    expect(Object.keys(detail).sort()).toEqual([
      "originalUrl",
      "publishedAt",
      "sourceTitle",
      "summary",
      "summaryErrorReason",
      "title",
      "translatedTitle",
    ]);
  });

  it("throws NotFoundException for unknown article id", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ArticlesController],
      providers: [
        {
          provide: ArticlesService,
          useValue: {
            getArticleById: jest.fn(() => Promise.resolve(null)),
          },
        },
      ],
    }).compile();

    const controller = moduleRef.get(ArticlesController);

    await expect(controller.getArticleById("does-not-exist")).rejects.toThrow(
      NotFoundException,
    );
  });
});
