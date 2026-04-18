import { Injectable, Logger } from "@nestjs/common";

import { getAppConfig } from "../config/app-config";
import { ArticleSummaryGateway } from "./article-summary.gateway";
import { ArticleSummaryParser } from "./article-summary.parser";
import { ArticleSummaryRepository } from "./article-summary.repository";

const DEFAULT_ARTICLE_SUMMARY_CONCURRENCY = 2;
const ARTICLE_SUMMARY_RETRY_DELAY_MS = 60_000;
const ARTICLE_SUMMARY_MAX_ATTEMPTS = 3;

export type ArticleSummaryScheduleReason =
  | "bootstrap_backfill"
  | "content_persisted"
  | "title_changed";

type ArticleSummaryJob = {
  articleId: string;
  attempt: number;
  reason: ArticleSummaryScheduleReason;
};

type ArticleSummaryScheduleResult =
  | { status: "scheduled" }
  | { status: "deduplicated"; reason: "already_scheduled" }
  | { status: "skipped"; reason: "llm_config_unavailable" };

type ArticleSummaryExecutionResult =
  | { status: "succeeded" }
  | { status: "retryable_failed"; reason: string }
  | { status: "terminal_failed"; reason: string }
  | { status: "skipped"; reason: "llm_config_unavailable" | "not_found" };

@Injectable()
export class ArticleSummaryService {
  private readonly logger = new Logger(ArticleSummaryService.name);
  private readonly maxConcurrentJobs =
    getAppConfig().llmSummary?.concurrency ??
    DEFAULT_ARTICLE_SUMMARY_CONCURRENCY;
  private readonly trackedArticleIds = new Set<string>();
  private readonly queue: ArticleSummaryJob[] = [];
  private activeWorkerCount = 0;

  constructor(
    private readonly repository: ArticleSummaryRepository,
    private readonly gateway: ArticleSummaryGateway,
    private readonly parser: ArticleSummaryParser,
  ) {}

  schedule(
    articleId: string,
    reason: ArticleSummaryScheduleReason,
  ): ArticleSummaryScheduleResult {
    if (!getAppConfig().llmSummary) {
      this.logger.log(
        JSON.stringify({
          articleId,
          reason,
          scope: "article_summary",
          status: "skipped",
          skipReason: "llm_config_unavailable",
        }),
      );

      return {
        reason: "llm_config_unavailable",
        status: "skipped",
      };
    }

    if (this.trackedArticleIds.has(articleId)) {
      return {
        reason: "already_scheduled",
        status: "deduplicated",
      };
    }

    this.trackedArticleIds.add(articleId);
    this.queue.push({
      articleId,
      attempt: 1,
      reason,
    });
    this.drainQueue();

    return {
      status: "scheduled",
    };
  }

  private drainQueue() {
    while (
      this.activeWorkerCount < this.maxConcurrentJobs &&
      this.queue.length > 0
    ) {
      const job = this.queue.shift();

      if (!job) {
        continue;
      }

      this.activeWorkerCount += 1;
      void this.runJob(job);
    }
  }

  private async runJob(job: ArticleSummaryJob) {
    try {
      const result = await this.executeJob(job);

      if (result.status === "retryable_failed") {
        await this.persistFailureState(job, result.reason, true);

        if (job.attempt >= ARTICLE_SUMMARY_MAX_ATTEMPTS) {
          this.trackedArticleIds.delete(job.articleId);
          return;
        }

        setTimeout(() => {
          this.queue.push({
            ...job,
            attempt: job.attempt + 1,
          });
          this.drainQueue();
        }, ARTICLE_SUMMARY_RETRY_DELAY_MS);

        return;
      }

      if (result.status === "terminal_failed") {
        await this.persistFailureState(job, result.reason, false);
      }

      this.trackedArticleIds.delete(job.articleId);
    } finally {
      this.activeWorkerCount -= 1;
      this.drainQueue();
    }
  }

  private async executeJob(
    job: ArticleSummaryJob,
  ): Promise<ArticleSummaryExecutionResult> {
    const generationInput = await this.repository.findGenerationInputById(
      job.articleId,
    );

    if (!generationInput) {
      return {
        reason: "not_found",
        status: "skipped",
      };
    }

    const gatewayResult = await this.gateway.generateSummary({
      contentMarkdown: generationInput.contentMarkdown,
      title: generationInput.title,
    });

    if (gatewayResult.status === "failed") {
      this.logger.warn(
        JSON.stringify({
          articleId: job.articleId,
          attempt: job.attempt,
          reason: gatewayResult.reason,
          retryable: gatewayResult.errorType === "retryable",
          scope: "article_summary",
          status: "failed",
          trigger: job.reason,
        }),
      );

      return gatewayResult.errorType === "retryable"
        ? {
            reason: gatewayResult.reason,
            status: "retryable_failed",
          }
        : {
            reason: gatewayResult.reason,
            status: "terminal_failed",
          };
    }

    const parsed = this.parser.parse(gatewayResult.output);

    if (!parsed.ok) {
      this.logger.warn(
        JSON.stringify({
          articleId: job.articleId,
          attempt: job.attempt,
          reason: parsed.reason,
          scope: "article_summary",
          status: "failed",
          trigger: job.reason,
        }),
      );

      return {
        reason: parsed.reason,
        status: "terminal_failed",
      };
    }

    await this.repository.saveSummaryResult({
      articleId: job.articleId,
      summary: parsed.summary,
      translatedTitle: parsed.translatedTitle,
    });

    this.logger.log(
      JSON.stringify({
        articleId: job.articleId,
        attempt: job.attempt,
        scope: "article_summary",
        status: "succeeded",
        trigger: job.reason,
      }),
    );

    return {
      status: "succeeded",
    };
  }

  private async persistFailureState(
    job: ArticleSummaryJob,
    reason: string,
    retryable: boolean,
  ) {
    await this.repository.saveSummaryFailure({
      articleId: job.articleId,
      reason,
    });
    this.logger.warn(
      JSON.stringify({
        articleId: job.articleId,
        attempt: job.attempt,
        persistedReason: reason,
        retryable,
        scope: "article_summary",
        status: "persisted_failure_state",
        trigger: job.reason,
      }),
    );
  }
}
