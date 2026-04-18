import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@repo/ui/components/button";
import { Separator } from "@repo/ui/components/separator";

import type { ArticleDetail } from "../api/articles-api";

type ArticleDetailProps = {
  article: ArticleDetail | null;
  isEmpty: boolean;
};

type EmptyStateProps = {
  title: string;
  description: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

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

function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <section className="flex min-h-0 flex-1 items-center justify-center px-8 py-10 lg:px-12 lg:py-12">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-foreground/68">{title}</p>
        <p className="mt-2 text-sm leading-6 text-foreground/54">
          {description}
        </p>
      </div>
    </section>
  );
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
  if (article.summaryErrorReason) {
    return (
      <div className="space-y-2">
        <p className="font-medium text-foreground">Summary generation failed</p>
        <p className="leading-7 text-foreground/80">
          {article.summaryErrorReason}
        </p>
      </div>
    );
  }

  return <p className="leading-7 text-foreground/80">Summary pending</p>;
}

export function ArticleDetailPane({ article, isEmpty }: ArticleDetailProps) {
  if (isEmpty) {
    return (
      <EmptyState
        title="No article selected"
        description="When prepared items are available, the summary view will appear here."
      />
    );
  }

  if (!article) {
    return (
      <EmptyState
        title="Article unavailable"
        description="The selected article is no longer available. Choose another one from the list."
      />
    );
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <header className="border-b border-border/80 px-5 py-4 lg:px-7 lg:py-5 xl:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-reader-eyebrow text-foreground/42 uppercase">
              Summary view
            </p>
            <p className="mt-1 text-reader-meta text-foreground/54">
              {article.sourceTitle} · {formatDate(article.publishedAt)}
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href={article.originalUrl} target="_blank" rel="noreferrer">
              Jump to original
            </Link>
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5 lg:px-7 lg:py-7 xl:px-8 xl:py-8">
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
      </div>
    </section>
  );
}
