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

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

describe("ArticleReaderShell", () => {
  it("keeps the reader shell as a fixed overflow-hidden boundary", () => {
    const html = renderReaderShell(secondArticleDetail, "a-2");

    expect(html).toContain("h-dvh min-h-dvh overflow-hidden");
    expect(html).toContain("h-[calc(100dvh-1rem-2px)]");
    expect(html).toContain("sm:h-[calc(100dvh-1.5rem-2px)]");
  });

  it("renders the shared scroll-area viewport and scrollbar structure", () => {
    const html = renderReaderShell(secondArticleDetail, "a-2");

    expect(html).toContain('data-slot="scroll-area"');
    expect(html).toContain('data-slot="scroll-area-viewport"');
  });

  it("renders dedicated list and detail scroll roots with headers outside the scroll body", () => {
    const html = renderReaderShell(secondArticleDetail, "a-2");

    expect(html).toContain('data-testid="article-list-scroll-area"');
    expect(html).toContain('data-testid="article-detail-scroll-area"');
    expect(countOccurrences(html, 'data-slot="scroll-area"')).toBe(2);
    expect(html).not.toContain("sm:h-full");

    expect(html.indexOf(">Articles<")).toBeLessThan(
      html.indexOf('data-testid="article-list-scroll-area"'),
    );
    expect(html.indexOf(">Summary view<")).toBeLessThan(
      html.indexOf('data-testid="article-detail-scroll-area"'),
    );
  });

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
    expect(html).toContain('data-testid="article-detail-scroll-area"');
  });
});

describe("ArticleReaderShell placeholder states", () => {
  it("renders the empty state when no articles are available", () => {
    const html = renderReaderShell(null, null, []);

    expect(html).toContain("Summary view");
    expect(html).toContain("No article selected");
    expect(html).toContain("When prepared items are available");
    expect(html).toContain('data-testid="article-detail-scroll-area"');
    expect(html).toContain("flex min-h-full flex-col");
    expect(html).toContain(
      "mx-auto w-full max-w-5xl flex min-h-full flex-1 flex-col",
    );
  });

  it("keeps the detail scroll body for unavailable and failed-summary states", () => {
    const unavailableHtml = renderReaderShell(null, "a-2");
    const failedHtml = renderReaderShell(
      {
        ...secondArticleDetail,
        summary: "",
        summaryErrorReason: "gateway_timeout",
      },
      "a-2",
    );

    expect(unavailableHtml).toContain("Article unavailable");
    expect(unavailableHtml).toContain(
      'data-testid="article-detail-scroll-area"',
    );
    expect(unavailableHtml).toContain("flex min-h-full flex-col");
    expect(unavailableHtml).toContain(
      "mx-auto w-full max-w-5xl flex min-h-full flex-1 flex-col",
    );
    expect(failedHtml).toContain("Summary generation failed");
    expect(failedHtml).toContain('data-testid="article-detail-scroll-area"');
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
