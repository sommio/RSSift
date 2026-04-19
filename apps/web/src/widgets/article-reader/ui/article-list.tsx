import Link from "next/link";

import { ScrollArea } from "@repo/ui/components/scroll-area";
import { cn } from "@repo/ui/lib/utils";

import type { ArticleListItem } from "../api/articles-api";

type ArticleListProps = {
  articles: ArticleListItem[];
  selectedArticleId: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getDisplayTitle(article: ArticleListItem) {
  return article.translatedTitle || article.title;
}

export function ArticleList({ articles, selectedArticleId }: ArticleListProps) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-b border-border/80 bg-card sm:w-64 sm:shrink-0 sm:border-r sm:border-b-0 md:w-72 xl:w-80 2xl:w-96">
      <div className="border-b border-border/80 px-4 py-4 lg:px-5 lg:py-5">
        <p className="text-reader-eyebrow text-foreground/42 uppercase">
          Articles
        </p>
      </div>

      {articles.length === 0 ? (
        <div className="min-h-0 flex-1 px-4 py-6 text-sm leading-6 text-foreground/58 lg:px-5">
          No prepared articles yet.
        </div>
      ) : (
        <ScrollArea
          data-testid="article-list-scroll-area"
          className="max-h-[34dvh] min-h-0 flex-1 sm:max-h-none"
        >
          <ol className="grid gap-3 p-3 lg:gap-4 lg:p-4">
            {articles.map((article) => {
              const isSelected = article.id === selectedArticleId;

              return (
                <li key={article.id} className="min-w-0">
                  <Link
                    href={{ pathname: "/", query: { articleId: article.id } }}
                    prefetch={false}
                    className={cn(
                      "group flex min-h-28 w-full min-w-0 flex-col justify-between rounded-2xl border px-4 py-3.5 transition-colors",
                      isSelected
                        ? "border-accent/22 bg-secondary/50 shadow-sm"
                        : "border-border/90 bg-background hover:border-accent/16 hover:bg-card",
                    )}
                  >
                    <h2 className="line-clamp-2 min-h-11 min-w-0 text-sm leading-6 font-semibold text-foreground">
                      {getDisplayTitle(article)}
                    </h2>
                    <div className="mt-3 min-w-0 space-y-1">
                      <p className="truncate text-reader-meta font-medium tracking-wide text-foreground/42 uppercase">
                        {article.sourceTitle}
                      </p>
                      <p className="text-reader-meta text-foreground/52">
                        {formatDate(article.publishedAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </ScrollArea>
      )}
    </aside>
  );
}
