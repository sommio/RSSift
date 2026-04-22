import { Injectable } from "@nestjs/common";
import OpenAI from "openai";

import { getAppConfig } from "../config/app-config";
import {
  createArticleSummaryFailure,
  type ArticleSummaryFailure,
} from "./article-summary.error";
import { buildArticleSummaryMessages } from "./article-summary.prompt";

type TextContentPart = {
  text: string;
  type: "text";
};

type ArticleSummaryGatewayResult =
  | {
      output: unknown;
      status: "succeeded";
    }
  | {
      failure: ArticleSummaryFailure;
      status: "failed";
    };

@Injectable()
export class ArticleSummaryGateway {
  async generateSummary(input: {
    contentMarkdown: string;
    title: string;
  }): Promise<ArticleSummaryGatewayResult> {
    const config = getAppConfig();

    if (!config.llmSummary) {
      return {
        failure: createArticleSummaryFailure({
          errorCode: "LLM_CONFIG_UNAVAILABLE",
          retryable: false,
        }),
        status: "failed",
      };
    }

    const client = this.createClient(config.llmSummary);

    try {
      const response = await client.chat.completions.create({
        model: config.llmSummary.model,
        messages: buildArticleSummaryMessages({
          contentMarkdown: input.contentMarkdown,
          language: config.llmSummary.language,
          title: input.title,
        }),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "article_summary",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                translatedTitle: {
                  type: "string",
                },
                summary: {
                  type: "string",
                },
                keyPoints: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
              },
              required: ["translatedTitle", "summary", "keyPoints"],
            },
            strict: true,
          },
        },
      });

      return {
        output: this.extractContent(
          response.choices[0]?.message.content ?? null,
        ),
        status: "succeeded",
      };
    } catch (error) {
      return {
        failure: this.normalizeFailure(error),
        status: "failed",
      };
    }
  }

  private createClient(
    config: NonNullable<ReturnType<typeof getAppConfig>["llmSummary"]>,
  ) {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
    });
  }

  private normalizeFailure(error: unknown): ArticleSummaryFailure {
    const status = this.getNumericProperty(error, "status");
    const name = this.getStringProperty(error, "name");
    const message = this.getMessage(error);
    const providerRequestId = this.getProviderRequestId(error);
    const diagnostics = {
      ...(typeof status === "number" ? { httpStatus: status } : {}),
      ...(name ? { sdkErrorName: name } : {}),
      ...(providerRequestId ? { providerRequestId } : {}),
      ...(typeof status === "number" || name || providerRequestId
        ? { provider: "openai_compatible" as const }
        : {}),
    };

    if (status === 401 || status === 403) {
      return createArticleSummaryFailure({
        diagnostics,
        errorCode: "LLM_AUTH_FAILED",
        retryable: false,
      });
    }

    if (status === 429) {
      return createArticleSummaryFailure({
        diagnostics,
        errorCode: "LLM_RATE_LIMITED",
        retryable: true,
      });
    }

    if (status === 408 || this.isTimeoutLike(name, message)) {
      return createArticleSummaryFailure({
        diagnostics,
        errorCode: "LLM_TIMEOUT",
        retryable: true,
      });
    }

    if (this.isConnectionLike(name, message)) {
      return createArticleSummaryFailure({
        diagnostics,
        errorCode: "LLM_CONNECTION_FAILED",
        retryable: true,
      });
    }

    if (
      message === "article_summary_gateway_empty_response" ||
      name === "SyntaxError"
    ) {
      return createArticleSummaryFailure({
        diagnostics,
        errorCode: "LLM_BAD_RESPONSE",
        retryable: false,
      });
    }

    if (status === 409 || (typeof status === "number" && status >= 500)) {
      return createArticleSummaryFailure({
        diagnostics,
        errorCode: "LLM_PROVIDER_FAILED",
        retryable: true,
      });
    }

    return createArticleSummaryFailure({
      diagnostics,
      errorCode: "LLM_PROVIDER_FAILED",
      retryable: false,
    });
  }

  private getProviderRequestId(error: unknown) {
    const directRequestId =
      this.getStringProperty(error, "_request_id") ??
      this.getStringProperty(error, "request_id");

    if (directRequestId) {
      return directRequestId;
    }

    if (typeof error !== "object" || error === null || !("headers" in error)) {
      return undefined;
    }

    const headers = error.headers;

    if (typeof headers !== "object" || headers === null) {
      return undefined;
    }

    const normalizedHeaders = headers as Record<string, unknown>;
    const requestId =
      normalizedHeaders["x-request-id"] ?? normalizedHeaders["request-id"];

    return typeof requestId === "string" ? requestId : undefined;
  }

  private getMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return this.getStringProperty(error, "message");
  }

  private getNumericProperty(error: unknown, key: string) {
    if (typeof error !== "object" || error === null || !(key in error)) {
      return undefined;
    }

    const value = (error as Record<string, unknown>)[key];
    return typeof value === "number" ? value : undefined;
  }

  private getStringProperty(error: unknown, key: string) {
    if (typeof error !== "object" || error === null || !(key in error)) {
      return undefined;
    }

    const value = (error as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  }

  private isConnectionLike(name?: string, message?: string) {
    return (
      Boolean(name?.includes("Connection")) ||
      message?.includes("ECONNRESET") === true ||
      message?.includes("ENOTFOUND") === true
    );
  }

  private isTimeoutLike(name?: string, message?: string) {
    return (
      Boolean(name?.includes("Timeout")) ||
      Boolean(name?.includes("Abort")) ||
      message?.includes("timed out") === true ||
      message?.includes("timeout") === true
    );
  }

  private isTextContentPart(value: unknown): value is TextContentPart {
    if (typeof value !== "object" || value === null) {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      candidate["type"] === "text" && typeof candidate["text"] === "string"
    );
  }

  private extractContent(content: unknown) {
    if (typeof content === "string") {
      return JSON.parse(content) as unknown;
    }

    if (Array.isArray(content)) {
      const textPart = content.find((part): part is TextContentPart =>
        this.isTextContentPart(part),
      );

      if (textPart) {
        return JSON.parse(textPart.text) as unknown;
      }
    }

    throw new Error("article_summary_gateway_empty_response");
  }
}
