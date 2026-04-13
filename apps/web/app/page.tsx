import { ArticleReaderPage } from "../src/widgets/article-reader/ui/article-reader-page";

type HomePageProps = {
  searchParams?: Promise<{
    articleId?: string;
  }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  if (!resolvedSearchParams?.articleId) {
    return <ArticleReaderPage />;
  }

  return (
    <ArticleReaderPage requestedArticleId={resolvedSearchParams.articleId} />
  );
}
