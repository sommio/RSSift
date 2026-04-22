import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ScrollArea } from "@repo/ui/components/scroll-area";
import { Separator } from "@repo/ui/components/separator";
import { cn } from "@repo/ui/lib/utils";

import type { ArticleDetail } from "../api/articles-api";
import { ArticleSummaryErrorBlock } from "./article-summary-error-block";
import { ArticleDetailHeader, EmptyState } from "./article-detail-frame";

type ArticleDetailProps = {
  article: ArticleDetail | null;
  isEmpty: boolean;
};

function getDisplayTitle(article: ArticleDetail) {
  return article.translatedTitle || article.title;
}

function stripSummaryTitleSection(summary: string) {
  const normalized = summary.trimStart();

  if (!normalized.startsWith("## Title")) {
    return summary;
  }

  const match = normalized.match(/^## Title\s*\n+\s*.+?(?=\n+##\s|$)/s);

  if (!match) {
    return summary;
  }

  return normalized.slice(match[0].length).trimStart();
}

function SummaryMarkdownContent({ summary }: { summary: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: ({ children }) => (
          <h2 className="mt-7 text-xl font-semibold text-foreground first:mt-0">
            {children}
          </h2>
        ),
        li: ({ children }) => (
          <li className="leading-7 text-foreground/80">{children}</li>
        ),
        ol: ({ children }) => (
          <ol className="mt-4 list-decimal space-y-2 pl-6">{children}</ol>
        ),
        p: ({ children }) => (
          <p className="mt-4 leading-7 text-foreground/80 first:mt-0">
            {children}
          </p>
        ),
      }}
    >
      {stripSummaryTitleSection(summary)}
    </ReactMarkdown>
  );
}

function SummaryFallback({ article }: { article: ArticleDetail }) {
  if (article.summaryError) {
    return <ArticleSummaryErrorBlock summaryError={article.summaryError} />;
  }

  return <p className="leading-7 text-foreground/80">Summary pending</p>;
}

export function ArticleDetailPane({ article, isEmpty }: ArticleDetailProps) {
  let content: ReactNode;
  const isPlaceholderState = isEmpty || !article;

  if (isEmpty) {
    content = (
      <EmptyState
        title="No article selected"
        description="When prepared items are available, the summary view will appear here."
      />
    );
  } else if (!article) {
    content = (
      <EmptyState
        title="Article unavailable"
        description="The selected article is no longer available. Choose another one from the list."
      />
    );
  } else {
    content = (
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="max-w-4xl text-reader-title text-foreground xl:text-reader-title-lg">
          {getDisplayTitle(article)}
        </h1>
        <Separator className="my-5 lg:my-6" />
        <article className="max-w-4xl text-reader-body text-foreground/80">
          {article.summary ? (
            <SummaryMarkdownContent summary={article.summary} />
          ) : (
            <SummaryFallback article={article} />
          )}
        </article>
      </div>
    );
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <ArticleDetailHeader article={article} />
      <ScrollArea
        data-testid="article-detail-scroll-area"
        className="min-h-0 flex-1"
      >
        <div
          className={cn(
            "px-5 py-5 lg:px-7 lg:py-7 xl:px-8 xl:py-8",
            isPlaceholderState && "flex min-h-full flex-col",
          )}
        >
          <div
            className={cn(
              "mx-auto w-full max-w-5xl",
              isPlaceholderState && "flex min-h-full flex-1 flex-col",
            )}
          >
            {content}
          </div>
        </div>
      </ScrollArea>
    </section>
  );
}
