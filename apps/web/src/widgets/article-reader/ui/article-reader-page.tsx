import {
  fetchArticleDetail,
  fetchArticles,
  type ArticleDetail,
} from "../api/articles-api";
import { ArticleReaderShell } from "./article-reader-shell";

type ArticleReaderPageProps = {
  requestedArticleId?: string;
};

export async function ArticleReaderPage({
  requestedArticleId,
}: ArticleReaderPageProps) {
  const articles = await fetchArticles();
  const selectedArticleId = requestedArticleId ?? articles[0]?.id ?? null;

  let detail: ArticleDetail | null = null;

  if (selectedArticleId) {
    detail = await fetchArticleDetail(selectedArticleId);
  }

  return (
    <ArticleReaderShell
      articles={articles}
      detail={detail}
      selectedArticleId={selectedArticleId}
    />
  );
}
