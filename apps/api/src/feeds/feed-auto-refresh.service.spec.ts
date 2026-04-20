import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FeedIngestionService } from "./feed-ingestion.service";
import type { FeedAutoRefreshRepository } from "./feed-auto-refresh.repository";
import { FeedAutoRefreshService } from "./feed-auto-refresh.service";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

describe("FeedAutoRefreshService", () => {
  const getLastSuccessfulAutoRefreshAt =
    jest.fn<FeedAutoRefreshRepository["getLastSuccessfulAutoRefreshAt"]>();
  const markSuccessfulAutoRefresh =
    jest.fn<FeedAutoRefreshRepository["markSuccessfulAutoRefresh"]>();
  const ingestFromOpml = jest.fn<FeedIngestionService["ingestFromOpml"]>();
  let service: FeedAutoRefreshService;
  let tempDir: string;
  let opmlPath: string;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse("2026-04-20T00:00:00.000Z"));
    process.env["DATABASE_URL"] =
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift";
    process.env["FEED_AUTO_REFRESH_INTERVAL_HOURS"] = "6";
    tempDir = mkdtempSync(join(tmpdir(), "rssift-feed-auto-refresh-"));
    opmlPath = join(tempDir, "feeds.opml");
    writeFileSync(opmlPath, '<opml version="2.0"><body /></opml>');
    process.env["FEED_OPML_PATH"] = opmlPath;
    getLastSuccessfulAutoRefreshAt.mockReset();
    markSuccessfulAutoRefresh.mockReset();
    ingestFromOpml.mockReset();
    service = new FeedAutoRefreshService(
      {
        getLastSuccessfulAutoRefreshAt,
        markSuccessfulAutoRefresh,
      } as never,
      {
        ingestFromOpml,
      } as never,
    );
  });

  afterEach(() => {
    service.onApplicationShutdown();
    if (tempDir) {
      rmSync(tempDir, { force: true, recursive: true });
    }
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("triggers a background refresh on same-process resume when no success timestamp exists", async () => {
    getLastSuccessfulAutoRefreshAt.mockResolvedValue(null);
    ingestFromOpml.mockResolvedValue({
      failedCount: 0,
      status: "all_success",
      successCount: 1,
      totalFeeds: 1,
      trigger: "auto_refresh_resume",
    });

    service.onApplicationBootstrap();
    service.onApplicationShutdown();
    await service.checkHeartbeat(Date.parse("2026-04-20T00:00:30.000Z"));
    await service.checkHeartbeat(Date.parse("2026-04-20T00:10:00.000Z"));

    expect(ingestFromOpml).toHaveBeenCalledWith(opmlPath, {
      maxAttemptsPerFeed: 3,
      trigger: "auto_refresh_resume",
    });
    expect(markSuccessfulAutoRefresh).toHaveBeenCalledWith(
      new Date("2026-04-20T00:10:00.000Z"),
    );
  });

  it("skips resume-driven refresh when the interval has not elapsed", async () => {
    getLastSuccessfulAutoRefreshAt.mockResolvedValue(
      new Date("2026-04-19T22:30:00.000Z"),
    );

    service.onApplicationBootstrap();
    service.onApplicationShutdown();
    await service.checkHeartbeat(Date.parse("2026-04-20T00:00:30.000Z"));
    await service.checkHeartbeat(Date.parse("2026-04-20T00:10:00.000Z"));

    expect(ingestFromOpml).not.toHaveBeenCalled();
    expect(markSuccessfulAutoRefresh).not.toHaveBeenCalled();
  });

  it("does not schedule a second refresh while one is already running", async () => {
    const deferred = createDeferred<{
      failedCount: number;
      status: "all_success";
      successCount: number;
      totalFeeds: number;
      trigger: "auto_refresh_resume";
    }>();
    const started = createDeferred<undefined>();

    getLastSuccessfulAutoRefreshAt.mockResolvedValue(null);
    ingestFromOpml.mockImplementation(() => {
      started.resolve(undefined);
      return deferred.promise;
    });

    service.onApplicationBootstrap();
    service.onApplicationShutdown();
    await service.checkHeartbeat(Date.parse("2026-04-20T00:00:30.000Z"));
    void service.checkHeartbeat(Date.parse("2026-04-20T00:10:00.000Z"));
    await started.promise;
    await service.checkHeartbeat(Date.parse("2026-04-20T00:20:00.000Z"));

    expect(ingestFromOpml).toHaveBeenCalledTimes(1);

    deferred.resolve({
      failedCount: 0,
      status: "all_success",
      successCount: 1,
      totalFeeds: 1,
      trigger: "auto_refresh_resume",
    });
    await Promise.resolve();
  });

  it("does not advance the persisted success timestamp when the run fully fails", async () => {
    getLastSuccessfulAutoRefreshAt.mockResolvedValue(null);
    ingestFromOpml.mockResolvedValue({
      failedCount: 1,
      status: "full_failure",
      successCount: 0,
      totalFeeds: 1,
      trigger: "auto_refresh_resume",
    });

    service.onApplicationBootstrap();
    service.onApplicationShutdown();
    await service.checkHeartbeat(Date.parse("2026-04-20T00:00:30.000Z"));
    await service.checkHeartbeat(Date.parse("2026-04-20T00:10:00.000Z"));

    expect(markSuccessfulAutoRefresh).not.toHaveBeenCalled();
  });

  it("swallows prerequisite failures so HTTP startup is not blocked", async () => {
    rmSync(tempDir, { force: true, recursive: true });
    getLastSuccessfulAutoRefreshAt.mockResolvedValue(null);

    service.onApplicationBootstrap();
    service.onApplicationShutdown();
    await service.checkHeartbeat(Date.parse("2026-04-20T00:00:30.000Z"));
    await expect(
      service.checkHeartbeat(Date.parse("2026-04-20T00:10:00.000Z")),
    ).resolves.toBeUndefined();
    expect(ingestFromOpml).not.toHaveBeenCalled();
  });
});
