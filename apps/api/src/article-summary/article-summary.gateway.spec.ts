import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { ArticleSummaryGateway } from "./article-summary.gateway";

type CreateCompletionResponse = {
  choices: Array<{
    message: {
      content: string | Array<{ text: string; type: "text" }>;
    };
  }>;
};

type CreateCompletionMock = jest.MockedFunction<
  () => Promise<CreateCompletionResponse>
>;

function createGatewayHarness() {
  jest.restoreAllMocks();
  process.env["DATABASE_URL"] =
    "postgresql://rssift:rssift@127.0.0.1:5432/rssift";
  process.env["LLM_BASE_URL"] = "https://llm-gateway.example.com/v1";
  process.env["LLM_API_KEY"] = "test-key";
  process.env["LLM_MODEL"] = "gpt-4.1-mini";
  delete process.env["LLM_TIMEOUT_MS"];
  delete process.env["LLM_SUMMARY_LANGUAGE"];

  const createCompletion = jest.fn<
    () => Promise<CreateCompletionResponse>
  >() as CreateCompletionMock;
  const gateway = new ArticleSummaryGateway();
  jest
    .spyOn(
      gateway as unknown as {
        createClient: () => {
          chat: {
            completions: {
              create: CreateCompletionMock;
            };
          };
        };
      },
      "createClient",
    )
    .mockReturnValue({
      chat: {
        completions: {
          create: createCompletion,
        },
      },
    });

  return {
    createCompletion,
    gateway,
  };
}

describe("ArticleSummaryGateway success and config handling", () => {
  let createCompletion: CreateCompletionMock;
  let gateway: ArticleSummaryGateway;

  beforeEach(() => {
    ({ createCompletion, gateway } = createGatewayHarness());
  });

  it("returns structured output on success", async () => {
    createCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              keyPoints: ["One"],
              summary: "Safe summary",
              translatedTitle: "安全标题",
            }),
          },
        },
      ],
    });

    await expect(
      gateway.generateSummary({
        contentMarkdown: "# Body",
        title: "Original title",
      }),
    ).resolves.toEqual({
      output: {
        keyPoints: ["One"],
        summary: "Safe summary",
        translatedTitle: "安全标题",
      },
      status: "succeeded",
    });
  });
});

describe("ArticleSummaryGateway normalized gateway failures", () => {
  let createCompletion: CreateCompletionMock;
  let gateway: ArticleSummaryGateway;

  beforeEach(() => {
    ({ createCompletion, gateway } = createGatewayHarness());
  });

  it("normalizes 401 failures into non-retryable auth failures without echoing provider text", async () => {
    createCompletion.mockRejectedValue({
      _request_id: "req-auth",
      message: "401 Bearer secret-token should never leak",
      name: "AuthenticationError",
      status: 401,
    });

    await expect(
      gateway.generateSummary({
        contentMarkdown: "# Body",
        title: "Original title",
      }),
    ).resolves.toEqual({
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
  });

  it("normalizes 429 and 5xx failures into retryable codes", async () => {
    createCompletion.mockRejectedValueOnce({
      headers: {
        "x-request-id": "req-rate-limit",
      },
      message: "too many requests",
      name: "RateLimitError",
      status: 429,
    });

    await expect(
      gateway.generateSummary({
        contentMarkdown: "# Body",
        title: "Original title",
      }),
    ).resolves.toEqual({
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

    createCompletion.mockRejectedValueOnce({
      message: "upstream meltdown",
      name: "InternalServerError",
      status: 502,
    });

    await expect(
      gateway.generateSummary({
        contentMarkdown: "# Body",
        title: "Original title",
      }),
    ).resolves.toEqual({
      failure: {
        diagnostics: {
          httpStatus: 502,
          provider: "openai_compatible",
          sdkErrorName: "InternalServerError",
        },
        errorCode: "LLM_PROVIDER_FAILED",
        retryable: true,
      },
      status: "failed",
    });
  });

  it("normalizes timeout, abort, and connection failures into retryable safe codes", async () => {
    createCompletion.mockRejectedValueOnce({
      message: "request timed out after 3000ms",
      name: "APIConnectionTimeoutError",
    });

    await expect(
      gateway.generateSummary({
        contentMarkdown: "# Body",
        title: "Original title",
      }),
    ).resolves.toEqual({
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

    createCompletion.mockRejectedValueOnce({
      message: "socket closed with ECONNRESET",
      name: "APIConnectionError",
    });

    await expect(
      gateway.generateSummary({
        contentMarkdown: "# Body",
        title: "Original title",
      }),
    ).resolves.toEqual({
      failure: {
        diagnostics: {
          provider: "openai_compatible",
          sdkErrorName: "APIConnectionError",
        },
        errorCode: "LLM_CONNECTION_FAILED",
        retryable: true,
      },
      status: "failed",
    });
  });
});

describe("ArticleSummaryGateway config and fallback failures", () => {
  let createCompletion: CreateCompletionMock;
  let gateway: ArticleSummaryGateway;

  beforeEach(() => {
    ({ createCompletion, gateway } = createGatewayHarness());
  });

  it("returns config-unavailable when llm config is missing and never creates a client", async () => {
    delete process.env["LLM_BASE_URL"];
    delete process.env["LLM_API_KEY"];
    delete process.env["LLM_MODEL"];

    const createClientSpy = jest.spyOn(
      gateway as unknown as {
        createClient: () => void;
      },
      "createClient",
    );

    await expect(
      gateway.generateSummary({
        contentMarkdown: "# Body",
        title: "Original title",
      }),
    ).resolves.toEqual({
      failure: {
        diagnostics: {},
        errorCode: "LLM_CONFIG_UNAVAILABLE",
        retryable: false,
      },
      status: "failed",
    });
    expect(createClientSpy).not.toHaveBeenCalled();
  });

  it("downgrades unknown and malformed responses into safe generic failures", async () => {
    createCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null as never,
          },
        },
      ],
    });

    await expect(
      gateway.generateSummary({
        contentMarkdown: "# Body",
        title: "Original title",
      }),
    ).resolves.toEqual({
      failure: {
        diagnostics: {
          provider: "openai_compatible",
          sdkErrorName: "Error",
        },
        errorCode: "LLM_BAD_RESPONSE",
        retryable: false,
      },
      status: "failed",
    });

    createCompletion.mockRejectedValueOnce({
      message: "Authorization: Bearer secret-token",
      name: "WeirdProviderError",
    });

    await expect(
      gateway.generateSummary({
        contentMarkdown: "# Body",
        title: "Original title",
      }),
    ).resolves.toEqual({
      failure: {
        diagnostics: {
          provider: "openai_compatible",
          sdkErrorName: "WeirdProviderError",
        },
        errorCode: "LLM_PROVIDER_FAILED",
        retryable: false,
      },
      status: "failed",
    });
  });
});
