import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { access } from "node:fs/promises";

import { ArticleSummaryBootstrapService } from "../article-summary/article-summary-bootstrap.service";
import { getAppConfig } from "../config/app-config";
import { FeedIngestionService } from "./feed-ingestion.service";

@Injectable()
export class FeedBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FeedBootstrapService.name);

  constructor(
    private readonly feedIngestionService: FeedIngestionService,
    private readonly articleSummaryBootstrapService: ArticleSummaryBootstrapService,
  ) {}

  async onApplicationBootstrap() {
    const config = getAppConfig();
    void this.articleSummaryBootstrapService
      .scheduleMissingCandidates()
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown article summary bootstrap error";

        this.logger.error(
          JSON.stringify({
            scope: "article_summary_bootstrap",
            status: "failed",
            reason: message,
          }),
        );
      });

    if (!config.ingestOnBoot) {
      this.logger.log(
        JSON.stringify({
          scope: "feed_ingestion_bootstrap",
          status: "skipped",
          reason: "INGEST_ON_BOOT=false",
        }),
      );
      return;
    }

    await this.assertBootstrapPrerequisites(config.feedOpmlPath);
    void this.feedIngestionService
      .ingestFromOpml(config.feedOpmlPath, {
        trigger: "bootstrap",
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unknown ingestion error";
        this.logger.error(
          JSON.stringify({
            scope: "feed_ingestion_bootstrap",
            status: "failed",
            reason: message,
          }),
        );
      });
  }

  private async assertBootstrapPrerequisites(feedOpmlPath: string) {
    try {
      await access(feedOpmlPath);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown access error";

      throw new Error(
        `Feed bootstrap prerequisites failed: cannot access ${feedOpmlPath}: ${message}`,
      );
    }
  }
}
