export type ArticleListItem = {
  id: string;
  originalUrl: string;
  publishedAt: string;
  sourceTitle: string;
  title: string;
  translatedTitle: string;
};

export type ArticleSummaryError = {
  action: string;
  code: string;
  copyText: string;
  message: string;
  title: string;
};

export type ArticleDetail = {
  originalUrl: string;
  publishedAt: string;
  sourceTitle: string;
  summary: string;
  summaryError: ArticleSummaryError | null;
  title: string;
  translatedTitle: string;
};

export class MissingApiBaseUrlError extends Error {
  constructor() {
    super(
      "Missing API_BASE_URL. Set apps/web/.env.local or apps/web/.env.example.",
    );
    this.name = "MissingApiBaseUrlError";
  }
}

function getApiBaseUrl() {
  const value = process.env["API_BASE_URL"];

  if (!value) {
    throw new MissingApiBaseUrlError();
  }

  return value.replace(/\/$/, "");
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `API request failed for ${path}: ${String(response.status)}`,
    );
  }

  return (await response.json()) as T;
}

export async function fetchArticles() {
  return fetchJson<ArticleListItem[]>("/articles");
}

export async function fetchArticleDetail(articleId: string) {
  const response = await fetch(
    `${getApiBaseUrl()}/articles/${encodeURIComponent(articleId)}`,
    {
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `API request failed for /articles/${articleId}: ${String(response.status)}`,
    );
  }

  return (await response.json()) as ArticleDetail;
}
