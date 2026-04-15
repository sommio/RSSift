import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FeedBootstrapService } from "./feed-bootstrap.service";

describe("FeedBootstrapService", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env["DATABASE_URL"] =
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift";
    process.env["TEST_DATABASE_URL"] =
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
  });

  it("skips ingestion when INGEST_ON_BOOT is false", async () => {
    process.env["INGEST_ON_BOOT"] = "false";

    const ingestFromOpml = jest.fn();
    const service = new FeedBootstrapService({
      ingestFromOpml,
    } as never);

    await service.onApplicationBootstrap();

    expect(ingestFromOpml).not.toHaveBeenCalled();
  });

  it("fails fast when the configured feeds.opml path is missing", async () => {
    process.env["INGEST_ON_BOOT"] = "true";
    process.env["FEED_OPML_PATH"] = "./missing.opml";

    const service = new FeedBootstrapService({
      ingestFromOpml: jest.fn(),
    } as never);

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
      const service = new FeedBootstrapService({
        ingestFromOpml,
      } as never);

      await service.onApplicationBootstrap();

      expect(ingestFromOpml).toHaveBeenCalledWith(opmlPath);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
