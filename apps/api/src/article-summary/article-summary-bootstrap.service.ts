import { Injectable, Logger } from "@nestjs/common";

import { getAppConfig } from "../config/app-config";
import { ArticleSummaryRepository } from "./article-summary.repository";
import { ArticleSummaryService } from "./article-summary.service";

type ArticleSummaryBootstrapResult =
  | {
      reason: "llm_config_unavailable";
      status: "skipped";
    }
  | {
      candidateCount: number;
      status: "scheduled";
    };

@Injectable()
export class ArticleSummaryBootstrapService {
  private readonly logger = new Logger(ArticleSummaryBootstrapService.name);

  constructor(
    private readonly repository: ArticleSummaryRepository,
    private readonly articleSummaryService: ArticleSummaryService,
  ) {}

  async scheduleMissingCandidates(): Promise<ArticleSummaryBootstrapResult> {
    if (!getAppConfig().llmSummary) {
      this.logger.log(
        JSON.stringify({
          scope: "article_summary_bootstrap",
          status: "skipped",
          reason: "llm_config_unavailable",
        }),
      );

      return {
        reason: "llm_config_unavailable",
        status: "skipped",
      };
    }

    const candidateIds = await this.repository.findPendingCandidateIds();

    for (const candidateId of candidateIds) {
      this.articleSummaryService.schedule(candidateId, "bootstrap_backfill");
    }

    this.logger.log(
      JSON.stringify({
        candidateCount: candidateIds.length,
        scope: "article_summary_bootstrap",
        status: "scheduled",
      }),
    );

    return {
      candidateCount: candidateIds.length,
      status: "scheduled",
    };
  }
}
