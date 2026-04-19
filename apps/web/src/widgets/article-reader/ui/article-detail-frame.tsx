import Link from "next/link";

import { Button } from "@repo/ui/components/button";

import type { ArticleDetail } from "../api/articles-api";

type ArticleDetailHeaderProps = {
  article: ArticleDetail | null;
};

type EmptyStateProps = {
  title: string;
  description: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function ArticleDetailHeader({ article }: ArticleDetailHeaderProps) {
  return (
    <header className="border-b border-border/80 px-5 py-4 lg:px-7 lg:py-5 xl:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-reader-eyebrow text-foreground/42 uppercase">
            Summary view
          </p>
          {article ? (
            <p className="mt-1 text-reader-meta text-foreground/54">
              {article.sourceTitle} · {formatDate(article.publishedAt)}
            </p>
          ) : null}
        </div>
        {article ? (
          <Button asChild className="shrink-0">
            <Link href={article.originalUrl} target="_blank" rel="noreferrer">
              Jump to original
            </Link>
          </Button>
        ) : null}
      </div>
    </header>
  );
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex min-h-full items-center justify-center px-8 py-10 lg:px-12 lg:py-12">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-foreground/68">{title}</p>
        <p className="mt-2 text-sm leading-6 text-foreground/54">
          {description}
        </p>
      </div>
    </div>
  );
}
