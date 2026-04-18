import { Injectable } from "@nestjs/common";
import OpenAI from "openai";

import { getAppConfig } from "../config/app-config";
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
      errorType: "permanent" | "retryable";
      reason: string;
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
        errorType: "permanent",
        reason: "llm_config_unavailable",
        status: "failed",
      };
    }

    const client = new OpenAI({
      apiKey: config.llmSummary.apiKey,
      baseURL: config.llmSummary.baseUrl,
      timeout: config.llmSummary.timeoutMs,
    });

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
        errorType: this.classifyError(error),
        reason: this.getErrorReason(error),
        status: "failed",
      };
    }
  }

  private classifyError(error: unknown): "permanent" | "retryable" {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? error.status
        : undefined;

    if (status === 401 || status === 403) {
      return "permanent";
    }

    if (
      status === 408 ||
      status === 409 ||
      status === 429 ||
      (typeof status === "number" && status >= 500)
    ) {
      return "retryable";
    }

    const name =
      typeof error === "object" && error !== null && "name" in error
        ? String(error.name)
        : "";

    if (
      name.includes("Timeout") ||
      name.includes("Connection") ||
      name.includes("Abort")
    ) {
      return "retryable";
    }

    return "permanent";
  }

  private getErrorReason(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
    ) {
      return error.message;
    }

    return "article_summary_gateway_failed";
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
