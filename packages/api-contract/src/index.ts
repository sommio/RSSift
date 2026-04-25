import {
  articleById,
  articles,
  getArticleByIdUrl,
  getArticlesUrl,
  getHealthLiveUrl,
  getHealthReadyUrl,
  healthLive,
  healthReady,
  type ArticleDetailItemDto,
  type ArticleListItemDto,
  type ArticleSummaryErrorDto,
  type HealthLiveResponseDto,
  type HealthReadyResponseDto,
} from "./generated/api-client";

export type {
  ArticleDetailItemDto,
  ArticleListItemDto,
  ArticleSummaryErrorDto,
  HealthLiveResponseDto,
  HealthReadyResponseDto,
};

export type ApiResponse<T> = {
  data: T;
  status: number;
};

export {
  articleById,
  articles,
  getArticleByIdUrl,
  getArticlesUrl,
  getHealthLiveUrl,
  getHealthReadyUrl,
  healthLive,
  healthReady,
};

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const response = await fetch(url, init);
  const data = response.body
    ? ((await response.json()) as T)
    : (undefined as unknown as T);

  return {
    data,
    status: response.status,
  };
}

export async function getArticles(
  apiBaseUrl: string,
  init?: RequestInit,
): Promise<ApiResponse<ArticleListItemDto[]>> {
  return fetchJson<ArticleListItemDto[]>(
    new URL(getArticlesUrl(), apiBaseUrl).toString(),
    {
      ...init,
      method: "GET",
    },
  );
}

export async function getArticleById(
  apiBaseUrl: string,
  encodedArticleId: string,
  init?: RequestInit,
): Promise<ApiResponse<ArticleDetailItemDto | null>> {
  const response = await fetch(
    new URL(`/articles/${encodedArticleId}`, apiBaseUrl).toString(),
    {
      ...init,
      method: "GET",
    },
  );

  if (response.status === 404) {
    return {
      data: null,
      status: response.status,
    };
  }

  const data = response.body
    ? ((await response.json()) as ArticleDetailItemDto)
    : (undefined as unknown as ArticleDetailItemDto);

  return {
    data,
    status: response.status,
  };
}

export async function getHealthLive(
  apiBaseUrl: string,
  init?: RequestInit,
): Promise<ApiResponse<HealthLiveResponseDto>> {
  return fetchJson<HealthLiveResponseDto>(
    new URL(getHealthLiveUrl(), apiBaseUrl).toString(),
    {
      ...init,
      method: "GET",
    },
  );
}

export async function getHealthReady(
  apiBaseUrl: string,
  init?: RequestInit,
): Promise<ApiResponse<HealthReadyResponseDto>> {
  return fetchJson<HealthReadyResponseDto>(
    new URL(getHealthReadyUrl(), apiBaseUrl).toString(),
    {
      ...init,
      method: "GET",
    },
  );
}
