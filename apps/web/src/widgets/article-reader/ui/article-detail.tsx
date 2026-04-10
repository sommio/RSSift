import Link from "next/link";

import { Button } from "@repo/ui/components/button";
import { Separator } from "@repo/ui/components/separator";

import type { ArticleDetail } from "../api/articles-api";

type ArticleDetailProps = {
  article: ArticleDetail | null;
  isEmpty: boolean;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function ArticleDetailPane({ article, isEmpty }: ArticleDetailProps) {
  if (isEmpty) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center px-8 py-10 lg:px-12 lg:py-12">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-foreground/68">
            No article selected
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground/54">
            When prepared items are available, the summary view will appear
            here.
          </p>
        </div>
      </section>
    );
  }

  if (!article) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center px-8 py-10 lg:px-12 lg:py-12">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-foreground/68">
            Article unavailable
          </p>
          <p className="mt-2 text-sm leading-6 text-foreground/54">
            The selected article is no longer available. Choose another one from
            the list.
          </p>
        </div>
      </section>
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
            {article.title}
          </h1>
          <Separator className="my-5 lg:my-6" />
          <article className="max-w-4xl text-reader-body text-foreground/80">
            <p>{article.summary}</p>
          </article>
        </div>
      </div>
    </section>
  );
}
