import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { ArticleContentExtractionService } from "./article-content-extraction.service";
import type { ArticleContentRepository } from "./article-content.repository";
import { ArticleContentService } from "./article-content.service";

describe("ArticleContentService", () => {
  const repository: Pick<
    jest.Mocked<ArticleContentRepository>,
    "findById" | "saveExtractedContent"
  > = {
    findById: jest.fn<ArticleContentRepository["findById"]>(),
    saveExtractedContent:
      jest.fn<ArticleContentRepository["saveExtractedContent"]>(),
  };
  const extractionService: Pick<
    jest.Mocked<ArticleContentExtractionService>,
    "extractFromHtml"
  > = {
    extractFromHtml:
      jest.fn<ArticleContentExtractionService["extractFromHtml"]>(),
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    repository.findById.mockReset();
    repository.saveExtractedContent.mockReset();
    extractionService.extractFromHtml.mockReset();
  });

  it("fetches article html, converts it to markdown, and persists it", async () => {
    repository.findById.mockResolvedValue({
      contentMarkdown: null,
      id: "article-1",
      originalUrl: "https://example.com/articles/1",
    });
    extractionService.extractFromHtml.mockResolvedValue({
      contentMarkdown: "# Article",
      ok: true,
    });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response("<article>body</article>", { status: 200 }),
      );

    const service = new ArticleContentService(
      repository as never,
      extractionService as never,
    );

    await expect(
      service.tryPersistArticleContent("article-1"),
    ).resolves.toEqual({
      status: "succeeded",
    });
    expect(repository.saveExtractedContent).toHaveBeenCalledWith({
      articleId: "article-1",
      contentMarkdown: "# Article",
      extractedAt: expect.any(Date),
    });
  });

  it("skips non-forced extraction when content already exists", async () => {
    repository.findById.mockResolvedValue({
      contentMarkdown: "# Existing",
      id: "article-1",
      originalUrl: "https://example.com/articles/1",
    });
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("unused", { status: 200 }));

    const service = new ArticleContentService(
      repository as never,
      extractionService as never,
    );

    await expect(
      service.tryPersistArticleContent("article-1"),
    ).resolves.toEqual({
      reason: "already_extracted",
      status: "skipped",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(repository.saveExtractedContent).not.toHaveBeenCalled();
  });

  it("keeps failure controlled when extraction fails", async () => {
    repository.findById.mockResolvedValue({
      contentMarkdown: null,
      id: "article-1",
      originalUrl: "https://example.com/articles/1",
    });
    extractionService.extractFromHtml.mockResolvedValue({
      ok: false,
      reason: "not_readable",
    });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("<html>noise</html>", { status: 200 }));

    const service = new ArticleContentService(
      repository as never,
      extractionService as never,
    );

    await expect(
      service.tryPersistArticleContent("article-1"),
    ).resolves.toEqual({
      reason: "not_readable",
      status: "failed",
    });
    expect(repository.saveExtractedContent).not.toHaveBeenCalled();
  });
});
