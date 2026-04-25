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

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

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

type ManagedFetch = {
  cleanup: () => void;
  signal: AbortSignal;
};

function createManagedFetchSignal(
  signal?: AbortSignal | null,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): ManagedFetch {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const onAbort = () => {
    controller.abort();
  };

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  return {
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    },
    signal: controller.signal,
  };
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const { cleanup, signal } = createManagedFetchSignal(init?.signal);

  try {
    const response = await fetch(url, {
      ...init,
      signal,
    });
    const data = response.body
      ? ((await response.json()) as T)
      : (undefined as unknown as T);

    return {
      data,
      status: response.status,
    };
  } finally {
    cleanup();
  }
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
  articleId: string,
  init?: RequestInit,
): Promise<ApiResponse<ArticleDetailItemDto | null>> {
  const { cleanup, signal } = createManagedFetchSignal(init?.signal);
  try {
    const response = await fetch(
      new URL(
        getArticleByIdUrl(encodeURIComponent(articleId)),
        apiBaseUrl,
      ).toString(),
      {
        ...init,
        signal,
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
  } finally {
    cleanup();
  }
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
