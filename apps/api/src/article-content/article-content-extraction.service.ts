import { Injectable } from "@nestjs/common";
import { Readability } from "@mozilla/readability";
import type { JSDOM as JSDOMClass } from "jsdom";
import type TurndownServiceClass from "turndown";

type ArticleContentExtractionInput = {
  html: string;
  pageUrl: string;
};

type ArticleContentExtractionSuccess = {
  contentMarkdown: string;
  ok: true;
};

type ArticleContentExtractionFailure = {
  ok: false;
  reason: "empty_markdown" | "not_readable";
};

export type ArticleContentExtractionResult =
  | ArticleContentExtractionSuccess
  | ArticleContentExtractionFailure;

@Injectable()
export class ArticleContentExtractionService {
  async extractFromHtml(
    input: ArticleContentExtractionInput,
  ): Promise<ArticleContentExtractionResult> {
    const [{ JSDOM }, turndownModule] = await Promise.all([
      import("jsdom") as Promise<{ JSDOM: typeof JSDOMClass }>,
      import("turndown") as Promise<{
        default: typeof TurndownServiceClass;
      }>,
    ]);
    const TurndownService = turndownModule.default;
    const turndown = new TurndownService({
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      headingStyle: "atx",
    });
    const dom = new JSDOM(input.html, {
      contentType: "text/html",
      url: input.pageUrl,
    });

    this.removeNoise(dom.window.document);

    const readableArticle = new Readability(dom.window.document).parse();

    const readableText = readableArticle?.textContent?.trim() ?? "";

    if (!readableArticle?.content?.trim() || readableText.length < 40) {
      return {
        ok: false,
        reason: "not_readable",
      };
    }

    const contentDom = new JSDOM(readableArticle.content, {
      contentType: "text/html",
      url: input.pageUrl,
    });
    const markdown = this.normalizeMarkdown(
      turndown.turndown(contentDom.window.document.body),
    );

    if (!markdown) {
      return {
        ok: false,
        reason: "empty_markdown",
      };
    }

    const title = readableArticle.title?.trim();
    const normalizedTitleMarkdown = title
      ? markdown.replace(
          new RegExp(`^#{2,6} ${this.escapeRegExp(title)}`),
          `# ${title}`,
        )
      : markdown;
    const titledMarkdown =
      title && !normalizedTitleMarkdown.startsWith("#")
        ? this.normalizeMarkdown(`# ${title}\n\n${normalizedTitleMarkdown}`)
        : normalizedTitleMarkdown;

    return {
      contentMarkdown: titledMarkdown,
      ok: true,
    };
  }

  private normalizeMarkdown(markdown: string) {
    return markdown
      .replace(/\r\n/g, "\n")
      .replace(/^## /, "# ")
      .replace(/^- {2,}/gm, "- ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private removeNoise(document: globalThis.Document) {
    for (const selector of ["script", "style", "noscript"]) {
      for (const node of document.querySelectorAll(selector)) {
        node.remove();
      }
    }
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
