import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { access } from "node:fs/promises";

import { getAppConfig } from "../config/app-config";
import { FeedIngestionService } from "./feed-ingestion.service";
import { FeedAutoRefreshRepository } from "./feed-auto-refresh.repository";

const HEARTBEAT_INTERVAL_MS = 30_000;
const RESUME_GAP_THRESHOLD_MS = HEARTBEAT_INTERVAL_MS * 3;
const MAX_AUTO_REFRESH_ATTEMPTS_PER_FEED = 3;

@Injectable()
export class FeedAutoRefreshService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(FeedAutoRefreshService.name);
  private heartbeat: NodeJS.Timeout | null = null;
  private isRefreshRunning = false;
  private lastHeartbeatAt = Date.now();

  constructor(
    private readonly repository: FeedAutoRefreshRepository,
    private readonly feedIngestionService: FeedIngestionService,
  ) {}

  onApplicationBootstrap() {
    this.lastHeartbeatAt = Date.now();
    this.heartbeat = setInterval(() => {
      void this.checkHeartbeat().catch((error: unknown) => {
        this.logger.error(
          JSON.stringify({
            scope: "feed_auto_refresh",
            status: "failed",
            reason:
              error instanceof Error
                ? error.message
                : "Unknown auto-refresh heartbeat failure",
          }),
        );
      });
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeat.unref();
  }

  onApplicationShutdown() {
    if (!this.heartbeat) {
      return;
    }

    clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  async checkHeartbeat(nowMs: number = Date.now()) {
    const gapMs = nowMs - this.lastHeartbeatAt;
    this.lastHeartbeatAt = nowMs;

    if (gapMs < RESUME_GAP_THRESHOLD_MS) {
      return;
    }

    await this.handleWakeResume(nowMs, gapMs);
  }

  private async handleWakeResume(nowMs: number, gapMs: number) {
    if (this.isRefreshRunning) {
      this.logger.log(
        JSON.stringify({
          scope: "feed_auto_refresh",
          status: "skipped",
          reason: "already_running",
          gapMs,
        }),
      );
      return;
    }

    const config = getAppConfig();
    const lastSuccessfulAutoRefreshAt =
      await this.repository.getLastSuccessfulAutoRefreshAt();
    const intervalMs = config.feedAutoRefreshIntervalHours * 60 * 60 * 1000;

    if (
      lastSuccessfulAutoRefreshAt &&
      nowMs - lastSuccessfulAutoRefreshAt.getTime() < intervalMs
    ) {
      this.logger.log(
        JSON.stringify({
          scope: "feed_auto_refresh",
          status: "skipped",
          reason: "interval_not_elapsed",
          gapMs,
          intervalHours: config.feedAutoRefreshIntervalHours,
          lastSuccessfulAutoRefreshAt:
            lastSuccessfulAutoRefreshAt.toISOString(),
        }),
      );
      return;
    }

    try {
      await access(config.feedOpmlPath);
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          scope: "feed_auto_refresh",
          status: "failed",
          reason:
            error instanceof Error
              ? `prerequisite_failed:${error.message}`
              : "prerequisite_failed",
          feedOpmlPath: config.feedOpmlPath,
        }),
      );
      return;
    }

    this.isRefreshRunning = true;
    this.logger.log(
      JSON.stringify({
        scope: "feed_auto_refresh",
        status: "triggered",
        gapMs,
      }),
    );

    try {
      const result = await this.feedIngestionService.ingestFromOpml(
        config.feedOpmlPath,
        {
          maxAttemptsPerFeed: MAX_AUTO_REFRESH_ATTEMPTS_PER_FEED,
          trigger: "auto_refresh_resume",
        },
      );

      if (result.successCount > 0) {
        await this.repository.markSuccessfulAutoRefresh(new Date(nowMs));
      }

      this.logger.log(
        JSON.stringify({
          scope: "feed_auto_refresh",
          status: result.status,
          successCount: result.successCount,
          failedCount: result.failedCount,
          totalFeeds: result.totalFeeds,
        }),
      );
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          scope: "feed_auto_refresh",
          status: "failed",
          reason:
            error instanceof Error
              ? error.message
              : "Unknown auto-refresh execution failure",
        }),
      );
    } finally {
      this.isRefreshRunning = false;
    }
  }
}
