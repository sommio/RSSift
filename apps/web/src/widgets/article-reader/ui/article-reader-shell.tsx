import { ArticleDetailPane } from "./article-detail";
import { ArticleList } from "./article-list";
import type { ArticleDetail, ArticleListItem } from "../api/articles-api";

type ArticleReaderShellProps = {
  articles: ArticleListItem[];
  detail: ArticleDetail | null;
  selectedArticleId: string | null;
};

export function ArticleReaderShell({
  articles,
  detail,
  selectedArticleId,
}: ArticleReaderShellProps) {
  const isEmpty = articles.length === 0;

  return (
    <main className="min-h-dvh bg-background px-2 py-2 text-foreground sm:px-3 sm:py-3 xl:px-4 xl:py-4">
      <section className="mx-auto flex min-h-[calc(100dvh-1rem)] w-full max-w-none flex-col overflow-hidden rounded-shell border border-border bg-card shadow-reader sm:min-h-[calc(100dvh-1.5rem)] sm:flex-row">
        <ArticleList
          articles={articles}
          selectedArticleId={selectedArticleId}
        />
        <ArticleDetailPane article={detail} isEmpty={isEmpty} />
      </section>
    </main>
  );
}
