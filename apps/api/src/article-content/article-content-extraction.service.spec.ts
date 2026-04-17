import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ArticleContentExtractionService } from "./article-content-extraction.service";

function readFixture(name: string) {
  return readFileSync(join(__dirname, "fixtures", name), "utf8");
}

describe("ArticleContentExtractionService", () => {
  const service = new ArticleContentExtractionService();

  it("extracts stable markdown from a readable article fixture", async () => {
    const result = await service.extractFromHtml({
      html: readFixture("clean-article.html"),
      pageUrl: "https://example.com/articles/clean",
    });

    expect(result).toEqual({
      contentMarkdown:
        "# Clean Article\n\nIntro paragraph with **important** context.\n\n## Details\n\n- First point\n- Second point",
      ok: true,
    });
  });

  it("resolves relative links and images against the article url", async () => {
    const result = await service.extractFromHtml({
      html: readFixture("noisy-relative-links-article.html"),
      pageUrl: "https://example.com/articles/relative",
    });

    expect(result).toEqual({
      contentMarkdown:
        "# Relative Links Article\n\nRead the [full report](https://example.com/reports/full) for more context and deeper implementation notes from the original incident write-up.\n\n![System diagram](https://example.com/assets/system.png)",
      ok: true,
    });
  });

  it("returns a controlled failure for non-readable pages", async () => {
    const result = await service.extractFromHtml({
      html: readFixture("non-readerable-page.html"),
      pageUrl: "https://example.com/articles/not-readable",
    });

    expect(result).toEqual({
      ok: false,
      reason: "not_readable",
    });
  });
});
