import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { ArticleSummaryRepository } from "./article-summary.repository";
import type { ArticleSummaryService } from "./article-summary.service";
import { ArticleSummaryBootstrapService } from "./article-summary-bootstrap.service";

function setBootstrapEnv() {
  process.env["DATABASE_URL"] =
    "postgresql://rssift:rssift@127.0.0.1:5432/rssift";
  delete process.env["LLM_BASE_URL"];
  delete process.env["LLM_API_KEY"];
  delete process.env["LLM_MODEL"];
}

describe("ArticleSummaryBootstrapService", () => {
  const repository: Pick<
    jest.Mocked<ArticleSummaryRepository>,
    "findPendingCandidateIds"
  > = {
    findPendingCandidateIds:
      jest.fn<ArticleSummaryRepository["findPendingCandidateIds"]>(),
  };
  const articleSummaryService: Pick<
    jest.Mocked<ArticleSummaryService>,
    "schedule"
  > = {
    schedule: jest.fn<ArticleSummaryService["schedule"]>(),
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    setBootstrapEnv();
    repository.findPendingCandidateIds.mockReset();
    articleSummaryService.schedule.mockReset();
  });

  it("cleanly skips bootstrap backfill when llm config is unavailable", async () => {
    const service = new ArticleSummaryBootstrapService(
      repository as never,
      articleSummaryService as never,
    );

    await expect(service.scheduleMissingCandidates()).resolves.toEqual({
      reason: "llm_config_unavailable",
      status: "skipped",
    });
    expect(repository.findPendingCandidateIds).not.toHaveBeenCalled();
    expect(articleSummaryService.schedule).not.toHaveBeenCalled();
  });

  it("finds eligible historical rows and schedules them without waiting for execution", async () => {
    process.env["LLM_BASE_URL"] = "https://llm-gateway.example.com/v1";
    process.env["LLM_API_KEY"] = "test-key";
    process.env["LLM_MODEL"] = "gpt-4.1-mini";
    repository.findPendingCandidateIds.mockResolvedValue([
      "article-1",
      "article-2",
    ]);

    const service = new ArticleSummaryBootstrapService(
      repository as never,
      articleSummaryService as never,
    );

    await expect(service.scheduleMissingCandidates()).resolves.toEqual({
      candidateCount: 2,
      status: "scheduled",
    });
    expect(articleSummaryService.schedule).toHaveBeenNthCalledWith(
      1,
      "article-1",
      "bootstrap_backfill",
    );
    expect(articleSummaryService.schedule).toHaveBeenNthCalledWith(
      2,
      "article-2",
      "bootstrap_backfill",
    );
  });
});
