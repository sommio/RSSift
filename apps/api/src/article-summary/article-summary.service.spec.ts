import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import type { ArticleSummaryGateway } from "./article-summary.gateway";
import type { ArticleSummaryParser } from "./article-summary.parser";
import type { ArticleSummaryRepository } from "./article-summary.repository";
import { ArticleSummaryService } from "./article-summary.service";

async function flushJobs() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const repository: Pick<
  jest.Mocked<ArticleSummaryRepository>,
  "findGenerationInputById" | "saveSummaryFailure" | "saveSummaryResult"
> = {
  findGenerationInputById:
    jest.fn<ArticleSummaryRepository["findGenerationInputById"]>(),
  saveSummaryFailure: jest.fn<ArticleSummaryRepository["saveSummaryFailure"]>(),
  saveSummaryResult: jest.fn<ArticleSummaryRepository["saveSummaryResult"]>(),
};
const gateway: Pick<jest.Mocked<ArticleSummaryGateway>, "generateSummary"> = {
  generateSummary: jest.fn<ArticleSummaryGateway["generateSummary"]>(),
};
const parser: Pick<jest.Mocked<ArticleSummaryParser>, "parse"> = {
  parse: jest.fn<ArticleSummaryParser["parse"]>(),
};

function resetArticleSummaryTestState() {
  jest.restoreAllMocks();
  jest.useRealTimers();
  process.env["DATABASE_URL"] =
    "postgresql://rssift:rssift@127.0.0.1:5432/rssift";
  process.env["LLM_BASE_URL"] = "https://llm-gateway.example.com/v1";
  process.env["LLM_API_KEY"] = "test-key";
  process.env["LLM_MODEL"] = "gpt-4.1-mini";
  delete process.env["LLM_SUMMARY_CONCURRENCY"];
  delete process.env["LLM_TIMEOUT_MS"];
  delete process.env["LLM_SUMMARY_LANGUAGE"];
  repository.findGenerationInputById.mockReset();
  repository.saveSummaryFailure.mockReset();
  repository.saveSummaryResult.mockReset();
  gateway.generateSummary.mockReset();
  parser.parse.mockReset();
}

function createArticleSummaryService() {
  return new ArticleSummaryService(
    repository as never,
    gateway as never,
    parser as never,
  );
}

function mockGenerationInput() {
  repository.findGenerationInputById.mockResolvedValue({
    contentMarkdown: "# Body",
    id: "article-1",
    title: "Original title",
  });
}

function mockSuccessfulGatewayAndParser() {
  gateway.generateSummary.mockResolvedValue({
    output: {
      keyPoints: ["One", "Two", "Three"],
      summary: "A concise summary paragraph.",
      translatedTitle: "翻译后的标题",
    },
    status: "succeeded",
  });
  parser.parse.mockReturnValue({
    ok: true,
    summary: `## Title

翻译后的标题

## Summary

A concise summary paragraph.

## Key Points

1. One
2. Two
3. Three`,
    translatedTitle: "翻译后的标题",
  });
}

function parseSuccessfulOutput(output: unknown) {
  const summaryOutput = output as { translatedTitle: string };

  return {
    ok: true as const,
    summary: `## Title\n\n${summaryOutput.translatedTitle}`,
    translatedTitle: summaryOutput.translatedTitle,
  };
}

afterEach(() => {
  jest.useRealTimers();
});

describe("ArticleSummaryService scheduling", () => {
  beforeEach(() => {
    resetArticleSummaryTestState();
  });

  it("persists translatedTitle and canonical markdown together after a successful generation", async () => {
    mockGenerationInput();
    mockSuccessfulGatewayAndParser();

    const service = createArticleSummaryService();

    expect(service.schedule("article-1", "content_persisted")).toMatchObject({
      status: "scheduled",
    });

    await flushJobs();

    expect(repository.saveSummaryResult).toHaveBeenCalledWith({
      articleId: "article-1",
      summary: expect.stringContaining("## Title"),
      translatedTitle: "翻译后的标题",
    });
    expect(repository.saveSummaryFailure).not.toHaveBeenCalled();
  });

  it("deduplicates an article while work is already queued or running", async () => {
    let releaseGateway: (() => void) | undefined;

    mockGenerationInput();
    gateway.generateSummary.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseGateway = () => {
            resolve({
              output: {
                keyPoints: ["One", "Two", "Three"],
                summary: "A concise summary paragraph.",
                translatedTitle: "翻译后的标题",
              },
              status: "succeeded",
            });
          };
        }),
    );
    parser.parse.mockReturnValue({
      ok: true,
      summary:
        "## Title\n\n翻译后的标题\n\n## Summary\n\nA concise summary paragraph.\n\n## Key Points\n\n1. One\n2. Two\n3. Three",
      translatedTitle: "翻译后的标题",
    });

    const service = createArticleSummaryService();

    expect(service.schedule("article-1", "content_persisted")).toEqual({
      status: "scheduled",
    });
    expect(service.schedule("article-1", "content_persisted")).toEqual({
      reason: "already_scheduled",
      status: "deduplicated",
    });

    releaseGateway?.();
    await flushJobs();

    expect(gateway.generateSummary).toHaveBeenCalledTimes(1);
  });

  it("starts two summary jobs in parallel by default and leaves the rest queued", async () => {
    const releaseGateway = new Map<string, () => void>();

    repository.findGenerationInputById.mockImplementation((articleId) =>
      Promise.resolve({
        contentMarkdown: `# ${articleId}`,
        id: articleId,
        title: articleId,
      }),
    );
    gateway.generateSummary.mockImplementation(
      ({ title }) =>
        new Promise((resolve) => {
          releaseGateway.set(title, () => {
            resolve({
              output: {
                keyPoints: ["One", "Two", "Three"],
                summary: `${title} summary`,
                translatedTitle: `${title} translated`,
              },
              status: "succeeded",
            });
          });
        }),
    );
    parser.parse.mockImplementation(parseSuccessfulOutput);

    const service = createArticleSummaryService();

    expect(service.schedule("article-1", "bootstrap_backfill")).toEqual({
      status: "scheduled",
    });
    expect(service.schedule("article-2", "bootstrap_backfill")).toEqual({
      status: "scheduled",
    });
    expect(service.schedule("article-3", "bootstrap_backfill")).toEqual({
      status: "scheduled",
    });

    await flushJobs();

    expect(gateway.generateSummary).toHaveBeenCalledTimes(2);
    expect(releaseGateway.has("article-1")).toBe(true);
    expect(releaseGateway.has("article-2")).toBe(true);
    expect(releaseGateway.has("article-3")).toBe(false);

    releaseGateway.get("article-1")?.();
    await flushJobs();

    expect(gateway.generateSummary).toHaveBeenCalledTimes(3);
    expect(releaseGateway.has("article-3")).toBe(true);

    releaseGateway.get("article-2")?.();
    releaseGateway.get("article-3")?.();
    await flushJobs();
  });

  it("respects an explicit summary concurrency override", async () => {
    process.env["LLM_SUMMARY_CONCURRENCY"] = "1";

    const releaseGateway = new Map<string, () => void>();

    repository.findGenerationInputById.mockImplementation((articleId) =>
      Promise.resolve({
        contentMarkdown: `# ${articleId}`,
        id: articleId,
        title: articleId,
      }),
    );
    gateway.generateSummary.mockImplementation(
      ({ title }) =>
        new Promise((resolve) => {
          releaseGateway.set(title, () => {
            resolve({
              output: {
                keyPoints: ["One", "Two", "Three"],
                summary: `${title} summary`,
                translatedTitle: `${title} translated`,
              },
              status: "succeeded",
            });
          });
        }),
    );
    parser.parse.mockImplementation(parseSuccessfulOutput);

    const service = createArticleSummaryService();

    service.schedule("article-1", "content_persisted");
    service.schedule("article-2", "content_persisted");

    await flushJobs();

    expect(gateway.generateSummary).toHaveBeenCalledTimes(1);
    expect(releaseGateway.has("article-1")).toBe(true);
    expect(releaseGateway.has("article-2")).toBe(false);

    releaseGateway.get("article-1")?.();
    await flushJobs();

    expect(gateway.generateSummary).toHaveBeenCalledTimes(2);
    expect(releaseGateway.has("article-2")).toBe(true);

    releaseGateway.get("article-2")?.();
    await flushJobs();
  });
});

describe("ArticleSummaryService failure handling", () => {
  beforeEach(() => {
    resetArticleSummaryTestState();
  });

  it("persists retryable failure codes only after retries are exhausted", async () => {
    jest.useFakeTimers();
    mockGenerationInput();
    gateway.generateSummary.mockResolvedValue({
      failure: {
        diagnostics: {
          httpStatus: 429,
          provider: "openai_compatible",
          providerRequestId: "req-rate-limit",
          sdkErrorName: "RateLimitError",
        },
        errorCode: "LLM_RATE_LIMITED",
        retryable: true,
      },
      status: "failed",
    });

    const service = createArticleSummaryService();

    service.schedule("article-1", "content_persisted");
    await flushJobs();
    expect(gateway.generateSummary).toHaveBeenCalledTimes(1);
    expect(repository.saveSummaryFailure).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(60_000);
    expect(gateway.generateSummary).toHaveBeenCalledTimes(2);
    expect(repository.saveSummaryFailure).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(60_000);
    expect(gateway.generateSummary).toHaveBeenCalledTimes(3);
    expect(repository.saveSummaryFailure).toHaveBeenCalledTimes(1);
    expect(repository.saveSummaryFailure).toHaveBeenLastCalledWith({
      articleId: "article-1",
      errorCode: "LLM_RATE_LIMITED",
    });
  });

  it("keeps refresh attempts fail-open until the final retry is exhausted", async () => {
    jest.useFakeTimers();
    mockGenerationInput();
    gateway.generateSummary.mockResolvedValue({
      failure: {
        diagnostics: {
          provider: "openai_compatible",
          sdkErrorName: "APIConnectionTimeoutError",
        },
        errorCode: "LLM_TIMEOUT",
        retryable: true,
      },
      status: "failed",
    });

    const service = createArticleSummaryService();

    service.schedule("article-1", "title_changed");
    await flushJobs();
    expect(repository.saveSummaryFailure).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(60_000);
    expect(repository.saveSummaryFailure).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(60_000);
    expect(repository.saveSummaryFailure).toHaveBeenCalledTimes(1);
    expect(repository.saveSummaryFailure).toHaveBeenCalledWith({
      articleId: "article-1",
      errorCode: "LLM_TIMEOUT",
    });
  });

  it("treats parser failures as terminal and persists the normalized bad-response code", async () => {
    mockGenerationInput();
    gateway.generateSummary.mockResolvedValue({
      output: {
        keyPoints: ["One", "Two", "Three"],
        summary: "Missing title",
      },
      status: "succeeded",
    });
    parser.parse.mockReturnValue({
      ok: false,
      reason: "invalid_summary_payload",
    });

    const service = createArticleSummaryService();

    service.schedule("article-1", "content_persisted");
    await flushJobs();

    expect(gateway.generateSummary).toHaveBeenCalledTimes(1);
    expect(repository.saveSummaryResult).not.toHaveBeenCalled();
    expect(repository.saveSummaryFailure).toHaveBeenCalledWith({
      articleId: "article-1",
      errorCode: "LLM_BAD_RESPONSE",
    });
  });

  it("does not retry permanent gateway failures", async () => {
    mockGenerationInput();
    gateway.generateSummary.mockResolvedValue({
      failure: {
        diagnostics: {
          httpStatus: 401,
          provider: "openai_compatible",
          providerRequestId: "req-auth",
          sdkErrorName: "AuthenticationError",
        },
        errorCode: "LLM_AUTH_FAILED",
        retryable: false,
      },
      status: "failed",
    });

    const service = createArticleSummaryService();

    service.schedule("article-1", "content_persisted");
    await flushJobs();

    expect(gateway.generateSummary).toHaveBeenCalledTimes(1);
    expect(repository.saveSummaryFailure).toHaveBeenCalledWith({
      articleId: "article-1",
      errorCode: "LLM_AUTH_FAILED",
    });
  });
});

describe("ArticleSummaryService failure logging", () => {
  beforeEach(() => {
    resetArticleSummaryTestState();
  });

  it("logs structured retry diagnostics without raw provider text", async () => {
    jest.useFakeTimers();
    mockGenerationInput();
    gateway.generateSummary.mockResolvedValue({
      failure: {
        diagnostics: {
          httpStatus: 429,
          provider: "openai_compatible",
          providerRequestId: "req-rate-limit",
          sdkErrorName: "RateLimitError",
        },
        errorCode: "LLM_RATE_LIMITED",
        retryable: true,
      },
      status: "failed",
    });

    const service = createArticleSummaryService();
    const loggerSpy = jest
      .spyOn(
        (
          service as unknown as {
            logger: { warn: (...args: unknown[]) => void };
          }
        ).logger,
        "warn",
      )
      .mockImplementation(() => {});

    service.schedule("article-1", "content_persisted");
    await flushJobs();

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('"errorCode":"LLM_RATE_LIMITED"'),
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('"providerRequestId":"req-rate-limit"'),
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.not.stringContaining("secret-token"),
    );
  });

  it("logs persisted failure state with stable error fields", async () => {
    mockGenerationInput();
    gateway.generateSummary.mockResolvedValue({
      failure: {
        diagnostics: {
          httpStatus: 401,
          provider: "openai_compatible",
          providerRequestId: "req-auth",
          sdkErrorName: "AuthenticationError",
        },
        errorCode: "LLM_AUTH_FAILED",
        retryable: false,
      },
      status: "failed",
    });

    const service = createArticleSummaryService();
    const loggerSpy = jest
      .spyOn(
        (
          service as unknown as {
            logger: { warn: (...args: unknown[]) => void };
          }
        ).logger,
        "warn",
      )
      .mockImplementation(() => {});

    service.schedule("article-1", "content_persisted");
    await flushJobs();

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('"status":"persisted_failure_state"'),
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('"errorCode":"LLM_AUTH_FAILED"'),
    );
  });
});
