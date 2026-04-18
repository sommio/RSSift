import { describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";

import { fetchArticleDetail } from "../src/widgets/article-reader/api/articles-api";
import { ArticleReaderShell } from "../src/widgets/article-reader/ui/article-reader-shell";

const articles = [
  {
    id: "a-1",
    title: "First prepared article",
    translatedTitle: "第一篇已准备文章",
    sourceTitle: "Monorepo Journal",
    publishedAt: "2026-04-10T08:00:00.000Z",
    originalUrl: "https://example.com/first",
  },
  {
    id: "a-2",
    title: "Second prepared article",
    translatedTitle: "",
    sourceTitle: "Reader Weekly",
    publishedAt: "2026-04-11T08:00:00.000Z",
    originalUrl: "https://example.com/second",
  },
];

const secondArticleDetail = {
  title: "Second prepared article",
  translatedTitle: "第二篇已准备文章",
  sourceTitle: "Reader Weekly",
  publishedAt: "2026-04-11T08:00:00.000Z",
  summary: `## Title

第二篇已准备文章

## Summary

The second article stays selected when the URL asks for it.

## Key Points

1. URL state keeps the selection stable.
2. The detail pane should render markdown headings.`,
  summaryErrorReason: "",
  originalUrl: "https://example.com/second",
};

const firstArticleDetail = {
  title: "First prepared article",
  translatedTitle: "第一篇已准备文章",
  sourceTitle: "Monorepo Journal",
  publishedAt: "2026-04-10T08:00:00.000Z",
  summary: `## Title

第一篇已准备文章

## Summary

Summary for the first prepared article.

## Key Points

1. Keep translated titles visible in the list.`,
  summaryErrorReason: "",
  originalUrl: "https://example.com/first",
};

function renderReaderShell(
  detail: React.ComponentProps<typeof ArticleReaderShell>["detail"],
  selectedArticleId: React.ComponentProps<
    typeof ArticleReaderShell
  >["selectedArticleId"],
  availableArticles = articles,
) {
  return renderToStaticMarkup(
    <ArticleReaderShell
      articles={availableArticles}
      detail={detail}
      selectedArticleId={selectedArticleId}
    />,
  );
}

describe("ArticleReaderShell", () => {
  it("renders the selected article detail", () => {
    const html = renderReaderShell(secondArticleDetail, "a-2");

    expect(html).toContain("Summary view");
    expect(html).toContain("第二篇已准备文章");
    expect(html).not.toContain(">Title<");
    expect(html).toContain(">Summary<");
    expect(html).toContain(">Key Points<");
    expect(html).toContain("URL state keeps the selection stable.");
    expect(html).toContain("Jump to original");
  });

  it("keeps article selection links in the list without exposing originalUrl anchors", () => {
    const html = renderReaderShell(firstArticleDetail, "a-1");

    expect(html).toContain('href="/?articleId=a-1"');
    expect(html).toContain('href="/?articleId=a-2"');
    expect(html).toContain("第一篇已准备文章");
    expect(html).toContain("Second prepared article");
    expect(html).not.toContain('aria-label="Open original:');
  });

  it("renders the persisted summary failure reason when prepared summary is empty", () => {
    const html = renderReaderShell(
      {
        ...secondArticleDetail,
        translatedTitle: "",
        summary: "",
        summaryErrorReason: "gateway_timeout",
      },
      "a-2",
    );

    expect(html).toContain("Second prepared article");
    expect(html).toContain("Summary generation failed");
    expect(html).toContain("gateway_timeout");
  });

  it("renders a pending-state copy when summary is not ready yet", () => {
    const html = renderReaderShell(
      {
        ...secondArticleDetail,
        translatedTitle: "",
        summary: "",
        summaryErrorReason: "",
      },
      "a-2",
    );

    expect(html).toContain("Summary pending");
  });

  it("renders the empty state when no articles are available", () => {
    const html = renderReaderShell(null, null, []);

    expect(html).toContain("No article selected");
    expect(html).toContain("When prepared items are available");
  });
});

describe("articles-api", () => {
  it("URL-encodes article ids when fetching detail", async () => {
    process.env["API_BASE_URL"] = "http://127.0.0.1:3000";
    // Jest's environment for this repo does not guarantee `fetch` exists.
    (global as unknown as { fetch?: unknown }).fetch = jest.fn();

    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ status: 404, ok: false } as unknown as Response);

    await fetchArticleDetail("a/b?c#d");

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/articles/a%2Fb%3Fc%23d",
      expect.anything(),
    );

    fetchSpy.mockRestore();
  });
});
