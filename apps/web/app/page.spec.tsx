import { describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";

import { fetchArticleDetail } from "../src/widgets/article-reader/api/articles-api";
import { ArticleReaderShell } from "../src/widgets/article-reader/ui/article-reader-shell";

describe("ArticleReaderShell", () => {
  const articles = [
    {
      id: "a-1",
      title: "First prepared article",
      sourceTitle: "Monorepo Journal",
      publishedAt: "2026-04-10T08:00:00.000Z",
      originalUrl: "https://example.com/first",
    },
    {
      id: "a-2",
      title: "Second prepared article",
      sourceTitle: "Reader Weekly",
      publishedAt: "2026-04-11T08:00:00.000Z",
      originalUrl: "https://example.com/second",
    },
  ];

  it("renders the selected article detail", () => {
    const html = renderToStaticMarkup(
      <ArticleReaderShell
        articles={articles}
        detail={{
          title: "Second prepared article",
          sourceTitle: "Reader Weekly",
          publishedAt: "2026-04-11T08:00:00.000Z",
          summary:
            "The second article stays selected when the URL asks for it.",
          originalUrl: "https://example.com/second",
        }}
        selectedArticleId="a-2"
      />,
    );

    expect(html).toContain("Summary view");
    expect(html).toContain("Second prepared article");
    expect(html).toContain("Jump to original");
  });

  it("keeps article selection links in the list without exposing originalUrl anchors", () => {
    const html = renderToStaticMarkup(
      <ArticleReaderShell
        articles={articles}
        detail={{
          title: "First prepared article",
          sourceTitle: "Monorepo Journal",
          publishedAt: "2026-04-10T08:00:00.000Z",
          summary: "Summary for the first prepared article.",
          originalUrl: "https://example.com/first",
        }}
        selectedArticleId="a-1"
      />,
    );

    expect(html).toContain('href="/?articleId=a-1"');
    expect(html).toContain('href="/?articleId=a-2"');
    expect(html).not.toContain('aria-label="Open original:');
  });

  it("renders the empty state when no articles are available", () => {
    const html = renderToStaticMarkup(
      <ArticleReaderShell
        articles={[]}
        detail={null}
        selectedArticleId={null}
      />,
    );

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
