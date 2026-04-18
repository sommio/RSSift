import { Injectable, Logger } from "@nestjs/common";

import { ArticleSummaryService } from "../article-summary/article-summary.service";
import { ArticleContentExtractionService } from "./article-content-extraction.service";
import { ArticleContentRepository } from "./article-content.repository";

const ARTICLE_FETCH_TIMEOUT_MS = 10_000;

type ArticleContentResult =
  | { status: "succeeded" }
  | {
      status: "skipped";
      reason: "already_extracted" | "missing_original_url" | "not_found";
    }
  | { status: "failed"; reason: string };

@Injectable()
export class ArticleContentService {
  private readonly logger = new Logger(ArticleContentService.name);

  constructor(
    private readonly repository: ArticleContentRepository,
    private readonly extractionService: ArticleContentExtractionService,
    private readonly articleSummaryService: ArticleSummaryService,
  ) {}

  async tryPersistArticleContent(
    articleId: string,
    options?: { force?: boolean; timeoutMs?: number },
  ): Promise<ArticleContentResult> {
    const article = await this.repository.findById(articleId);

    if (!article) {
      return {
        reason: "not_found",
        status: "skipped",
      };
    }

    if (!article.originalUrl) {
      return {
        reason: "missing_original_url",
        status: "skipped",
      };
    }

    if (article.contentMarkdown && !options?.force) {
      return {
        reason: "already_extracted",
        status: "skipped",
      };
    }

    try {
      const html = await this.fetchArticleHtml(
        article.originalUrl,
        options?.timeoutMs,
      );
      const extraction = await this.extractionService.extractFromHtml({
        html,
        pageUrl: article.originalUrl,
      });

      if (!extraction.ok) {
        this.logger.warn(
          JSON.stringify({
            articleId,
            reason: extraction.reason,
            scope: "article_content",
            status: "failed",
          }),
        );

        return {
          reason: extraction.reason,
          status: "failed",
        };
      }

      await this.repository.saveExtractedContent({
        articleId,
        contentMarkdown: extraction.contentMarkdown,
        extractedAt: new Date(),
      });
      try {
        this.articleSummaryService.schedule(articleId, "content_persisted");
      } catch (error) {
        const reason =
          error instanceof Error
            ? error.message
            : "article_summary_schedule_failed";

        this.logger.warn(
          JSON.stringify({
            articleId,
            reason,
            scope: "article_content_summary_schedule",
            status: "failed",
          }),
        );
      }

      this.logger.log(
        JSON.stringify({
          articleId,
          scope: "article_content",
          status: "succeeded",
        }),
      );

      return {
        status: "succeeded",
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "article_content_fetch_failed";

      this.logger.warn(
        JSON.stringify({
          articleId,
          reason,
          scope: "article_content",
          status: "failed",
        }),
      );

      return {
        reason,
        status: "failed",
      };
    }
  }

  private async fetchArticleHtml(
    originalUrl: string,
    timeoutMs = ARTICLE_FETCH_TIMEOUT_MS,
  ) {
    const effectiveTimeoutMs = Math.max(
      1,
      Math.min(timeoutMs, ARTICLE_FETCH_TIMEOUT_MS),
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, effectiveTimeoutMs);

    try {
      const response = await fetch(originalUrl, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Article request failed with status ${String(response.status)}`,
        );
      }

      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }
}
