import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { access } from "node:fs/promises";

import { getAppConfig } from "../config/app-config";
import { FeedIngestionService } from "./feed-ingestion.service";

@Injectable()
export class FeedBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FeedBootstrapService.name);

  constructor(private readonly feedIngestionService: FeedIngestionService) {}

  async onApplicationBootstrap() {
    const config = getAppConfig();

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
    void this.feedIngestionService.ingestFromOpml(config.feedOpmlPath);
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
