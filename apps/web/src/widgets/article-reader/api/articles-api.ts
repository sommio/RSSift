import {
  getArticleById,
  getArticles,
  type ArticleDetailItemDto,
  type ArticleListItemDto,
  type ArticleSummaryErrorDto,
} from "@repo/api-contract";

export type ArticleListItem = ArticleListItemDto;
export type ArticleSummaryError = ArticleSummaryErrorDto;
export type ArticleDetail = ArticleDetailItemDto;

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

export async function fetchArticles() {
  const response = await getArticles(getApiBaseUrl(), {
    cache: "no-store",
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `API request failed for /articles: ${String(response.status)}`,
    );
  }

  return response.data;
}

export async function fetchArticleDetail(articleId: string) {
  const response = await getArticleById(
    getApiBaseUrl(),
    encodeURIComponent(articleId),
    {
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `API request failed for /articles/${articleId}: ${String(response.status)}`,
    );
  }

  return response.data;
}
