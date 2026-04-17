import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

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
    jest.useRealTimers();
    repository.findById.mockReset();
    repository.saveExtractedContent.mockReset();
    extractionService.extractFromHtml.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
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

  it("uses the caller timeout budget when it is tighter than the default fetch timeout", async () => {
    jest.useFakeTimers();
    repository.findById.mockResolvedValue({
      contentMarkdown: null,
      id: "article-1",
      originalUrl: "https://example.com/articles/1",
    });
    jest.spyOn(global, "fetch").mockImplementation((_input, init) => {
      const signal = init?.signal;

      return new Promise((_, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new Error("fetch_aborted"));
        });
      });
    });

    const service = new ArticleContentService(
      repository as never,
      extractionService as never,
    );
    const pending = service.tryPersistArticleContent("article-1", {
      timeoutMs: 5,
    });

    await jest.advanceTimersByTimeAsync(5);

    await expect(pending).resolves.toEqual({
      reason: "fetch_aborted",
      status: "failed",
    });
    expect(extractionService.extractFromHtml).not.toHaveBeenCalled();
    expect(repository.saveExtractedContent).not.toHaveBeenCalled();
  });
});
