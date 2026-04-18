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
import type { ArticleSummaryService } from "../article-summary/article-summary.service";
import { ArticleContentService } from "./article-content.service";

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
const articleSummaryService: Pick<
  jest.Mocked<ArticleSummaryService>,
  "schedule"
> = {
  schedule: jest.fn<ArticleSummaryService["schedule"]>(),
};

function resetArticleContentTestState() {
  jest.restoreAllMocks();
  jest.useRealTimers();
  repository.findById.mockReset();
  repository.saveExtractedContent.mockReset();
  extractionService.extractFromHtml.mockReset();
  articleSummaryService.schedule.mockReset();
}

function createArticleContentService() {
  return new ArticleContentService(
    repository as never,
    extractionService as never,
    articleSummaryService as never,
  );
}

function mockArticleToExtract(contentMarkdown: string | null = null) {
  repository.findById.mockResolvedValue({
    contentMarkdown,
    id: "article-1",
    originalUrl: "https://example.com/articles/1",
  });
}

afterEach(() => {
  jest.useRealTimers();
});

describe("ArticleContentService success paths", () => {
  beforeEach(() => {
    resetArticleContentTestState();
  });

  it("fetches article html, converts it to markdown, and persists it", async () => {
    mockArticleToExtract();
    extractionService.extractFromHtml.mockResolvedValue({
      contentMarkdown: "# Article",
      ok: true,
    });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response("<article>body</article>", { status: 200 }),
      );

    const service = createArticleContentService();

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
    expect(articleSummaryService.schedule).toHaveBeenCalledWith(
      "article-1",
      "content_persisted",
    );
  });

  it("skips non-forced extraction when content already exists", async () => {
    mockArticleToExtract("# Existing");
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("unused", { status: 200 }));

    const service = createArticleContentService();

    await expect(
      service.tryPersistArticleContent("article-1"),
    ).resolves.toEqual({
      reason: "already_extracted",
      status: "skipped",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(repository.saveExtractedContent).not.toHaveBeenCalled();
    expect(articleSummaryService.schedule).not.toHaveBeenCalled();
  });
});

describe("ArticleContentService failure handling", () => {
  beforeEach(() => {
    resetArticleContentTestState();
  });

  it("keeps failure controlled when extraction fails", async () => {
    mockArticleToExtract();
    extractionService.extractFromHtml.mockResolvedValue({
      ok: false,
      reason: "not_readable",
    });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("<html>noise</html>", { status: 200 }));

    const service = createArticleContentService();

    await expect(
      service.tryPersistArticleContent("article-1"),
    ).resolves.toEqual({
      reason: "not_readable",
      status: "failed",
    });
    expect(repository.saveExtractedContent).not.toHaveBeenCalled();
    expect(articleSummaryService.schedule).not.toHaveBeenCalled();
  });

  it("uses the caller timeout budget when it is tighter than the default fetch timeout", async () => {
    jest.useFakeTimers();
    mockArticleToExtract();
    jest.spyOn(global, "fetch").mockImplementation((_input, init) => {
      const signal = init?.signal;

      return new Promise((_, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new Error("fetch_aborted"));
        });
      });
    });

    const service = createArticleContentService();
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
    expect(articleSummaryService.schedule).not.toHaveBeenCalled();
  });

  it("keeps content persistence fail-open when summary scheduling throws", async () => {
    mockArticleToExtract();
    extractionService.extractFromHtml.mockResolvedValue({
      contentMarkdown: "# Article",
      ok: true,
    });
    articleSummaryService.schedule.mockImplementation(() => {
      throw new Error("scheduler_unavailable");
    });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response("<article>body</article>", { status: 200 }),
      );

    const service = createArticleContentService();

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
});
