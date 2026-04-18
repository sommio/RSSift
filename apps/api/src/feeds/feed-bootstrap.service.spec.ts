import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ArticleSummaryBootstrapService } from "../article-summary/article-summary-bootstrap.service";
import { FeedBootstrapService } from "./feed-bootstrap.service";

describe("FeedBootstrapService", () => {
  const scheduleMissingCandidates =
    jest.fn<ArticleSummaryBootstrapService["scheduleMissingCandidates"]>();

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env["DATABASE_URL"] =
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift";
    scheduleMissingCandidates.mockReset();
    scheduleMissingCandidates.mockResolvedValue({
      candidateCount: 0,
      status: "scheduled",
    });
  });

  it("skips ingestion when INGEST_ON_BOOT is false", async () => {
    process.env["INGEST_ON_BOOT"] = "false";

    const ingestFromOpml = jest.fn();
    const service = new FeedBootstrapService(
      {
        ingestFromOpml,
      } as never,
      {
        scheduleMissingCandidates,
      } as never,
    );

    await service.onApplicationBootstrap();

    expect(ingestFromOpml).not.toHaveBeenCalled();
    expect(scheduleMissingCandidates).toHaveBeenCalledTimes(1);
  });

  it("fails fast when the configured feeds.opml path is missing", async () => {
    process.env["INGEST_ON_BOOT"] = "true";
    process.env["FEED_OPML_PATH"] = "./missing.opml";

    const service = new FeedBootstrapService(
      {
        ingestFromOpml: jest.fn(),
      } as never,
      {
        scheduleMissingCandidates,
      } as never,
    );

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      "Feed bootstrap prerequisites failed",
    );
  });

  it("kicks off ingestion when bootstrap prerequisites are present", async () => {
    process.env["INGEST_ON_BOOT"] = "true";
    const tempDir = mkdtempSync(join(tmpdir(), "rssift-feed-bootstrap-"));
    const opmlPath = join(tempDir, "feeds.opml");
    process.env["FEED_OPML_PATH"] = opmlPath;
    writeFileSync(opmlPath, '<opml version="2.0"><body /></opml>');

    try {
      const ingestFromOpml = jest.fn<(path: string) => Promise<void>>(() =>
        Promise.resolve(undefined),
      );
      const service = new FeedBootstrapService(
        {
          ingestFromOpml,
        } as never,
        {
          scheduleMissingCandidates,
        } as never,
      );

      await service.onApplicationBootstrap();

      expect(scheduleMissingCandidates).toHaveBeenCalledTimes(1);
      expect(ingestFromOpml).toHaveBeenCalledWith(opmlPath);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("catches and logs ingestion errors instead of letting them escape as unhandled rejections", async () => {
    process.env["INGEST_ON_BOOT"] = "true";
    const tempDir = mkdtempSync(join(tmpdir(), "rssift-feed-bootstrap-"));
    const opmlPath = join(tempDir, "feeds.opml");
    process.env["FEED_OPML_PATH"] = opmlPath;
    writeFileSync(opmlPath, '<opml version="2.0"><body /></opml>');

    try {
      const ingestError = new Error("Simulated ingestion failure");
      const ingestFromOpml = jest.fn<(path: string) => Promise<void>>(() =>
        Promise.reject(ingestError),
      );
      const service = new FeedBootstrapService(
        {
          ingestFromOpml,
        } as never,
        {
          scheduleMissingCandidates,
        } as never,
      );

      // NestJS Logger is a private instance; casting is the pragmatic way to observe it in tests.
      const loggerSpy = jest
        .spyOn(
          (
            service as unknown as {
              logger: { error: (...args: unknown[]) => void };
            }
          ).logger,
          "error",
        )
        .mockImplementation(() => {});

      // Should NOT throw even though ingestion fails
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

      expect(scheduleMissingCandidates).toHaveBeenCalledTimes(1);
      expect(ingestFromOpml).toHaveBeenCalledWith(opmlPath);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("feed_ingestion_bootstrap"),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("Simulated ingestion failure"),
      );
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
