import { Injectable, Logger } from "@nestjs/common";

import { getAppConfig } from "../config/app-config";
import {
  createArticleSummaryFailure,
  type ArticleSummaryFailure,
} from "./article-summary.error";
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
  | { failure: ArticleSummaryFailure; status: "retryable_failed" }
  | { failure: ArticleSummaryFailure; status: "terminal_failed" }
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
        if (job.attempt >= ARTICLE_SUMMARY_MAX_ATTEMPTS) {
          await this.persistFailureState(job, result.failure);
          this.trackedArticleIds.delete(job.articleId);
          return;
        }

        this.logger.warn(
          JSON.stringify(
            this.buildFailureLog(job, {
              failure: result.failure,
              status: "scheduled_retry",
            }),
          ),
        );

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
        await this.persistFailureState(job, result.failure);
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
        JSON.stringify(
          this.buildFailureLog(job, {
            failure: gatewayResult.failure,
            status: "failed",
          }),
        ),
      );

      return gatewayResult.failure.retryable
        ? {
            failure: gatewayResult.failure,
            status: "retryable_failed",
          }
        : {
            failure: gatewayResult.failure,
            status: "terminal_failed",
          };
    }

    const parsed = this.parser.parse(gatewayResult.output);

    if (!parsed.ok) {
      const failure = createArticleSummaryFailure({
        diagnostics: {
          provider: "openai_compatible",
        },
        errorCode: "LLM_BAD_RESPONSE",
        retryable: false,
      });
      this.logger.warn(
        JSON.stringify(
          this.buildFailureLog(job, {
            failure,
            status: "failed",
          }),
        ),
      );

      return {
        failure,
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
    failure: ArticleSummaryFailure,
  ) {
    await this.repository.saveSummaryFailure({
      articleId: job.articleId,
      errorCode: failure.errorCode,
    });

    this.logger.warn(
      JSON.stringify(
        this.buildFailureLog(job, {
          failure,
          status: "persisted_failure_state",
        }),
      ),
    );
  }

  private buildFailureLog(
    job: ArticleSummaryJob,
    input: {
      failure: ArticleSummaryFailure;
      status: "failed" | "persisted_failure_state" | "scheduled_retry";
    },
  ) {
    return {
      articleId: job.articleId,
      attempt: job.attempt,
      errorCode: input.failure.errorCode,
      retryable: input.failure.retryable,
      scope: "article_summary",
      status: input.status,
      trigger: job.reason,
      ...input.failure.diagnostics,
    };
  }
}
