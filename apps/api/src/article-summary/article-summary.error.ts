export const ARTICLE_SUMMARY_ERROR_CODES = [
  "LLM_AUTH_FAILED",
  "LLM_RATE_LIMITED",
  "LLM_TIMEOUT",
  "LLM_CONNECTION_FAILED",
  "LLM_BAD_RESPONSE",
  "LLM_PROVIDER_FAILED",
  "LLM_CONFIG_UNAVAILABLE",
] as const;

export type ArticleSummaryErrorCode =
  (typeof ARTICLE_SUMMARY_ERROR_CODES)[number];

export type ArticleSummaryFailureDiagnostics = {
  httpStatus?: number;
  provider?: "openai_compatible";
  providerRequestId?: string;
  sdkErrorName?: string;
};

export type ArticleSummaryFailure = {
  diagnostics: ArticleSummaryFailureDiagnostics;
  errorCode: ArticleSummaryErrorCode;
  retryable: boolean;
};

export type ArticleSummarySafeError = {
  action: string;
  code: ArticleSummaryErrorCode;
  copyText: string;
  message: string;
  title: string;
};

const SAFE_ERROR_COPY: Record<
  ArticleSummaryErrorCode,
  Omit<ArticleSummarySafeError, "code">
> = {
  LLM_AUTH_FAILED: {
    action: "Please report this article to the maintainer and try again later.",
    copyText:
      "Summary unavailable (LLM_AUTH_FAILED). Ask the maintainer to verify the LLM provider credentials and access policy.",
    message:
      "The summary provider rejected this request before a summary could be prepared.",
    title: "Summary service needs attention",
  },
  LLM_BAD_RESPONSE: {
    action:
      "Refresh later. If the same article keeps failing, send the support note to the maintainer.",
    copyText:
      "Summary unavailable (LLM_BAD_RESPONSE). The provider response could not be safely converted into a reader summary.",
    message:
      "The summary provider returned a response that could not be safely used.",
    title: "Summary response was unusable",
  },
  LLM_CONFIG_UNAVAILABLE: {
    action: "Please report this article to the maintainer and try again later.",
    copyText:
      "Summary unavailable (LLM_CONFIG_UNAVAILABLE). The summary service is not configured for this environment.",
    message:
      "This environment does not currently have a summary provider configured.",
    title: "Summary service is unavailable",
  },
  LLM_CONNECTION_FAILED: {
    action:
      "Refresh later. If the problem continues, send the support note to the maintainer.",
    copyText:
      "Summary unavailable (LLM_CONNECTION_FAILED). The service could not reach the summary provider.",
    message:
      "The app could not establish a stable connection to the summary provider.",
    title: "Summary provider connection failed",
  },
  LLM_PROVIDER_FAILED: {
    action:
      "Refresh later. If the same article keeps failing, send the support note to the maintainer.",
    copyText:
      "Summary unavailable (LLM_PROVIDER_FAILED). The provider failed before a safe summary could be prepared.",
    message:
      "The summary provider failed before a safe summary could be prepared.",
    title: "Summary provider failed",
  },
  LLM_RATE_LIMITED: {
    action:
      "Please wait a moment and refresh later. Report it if the delay does not clear.",
    copyText:
      "Summary unavailable (LLM_RATE_LIMITED). The summary provider asked this app to slow down and retry later.",
    message: "The summary provider is rate limiting requests right now.",
    title: "Summary is temporarily rate limited",
  },
  LLM_TIMEOUT: {
    action:
      "Refresh later. If timeouts keep happening, send the support note to the maintainer.",
    copyText:
      "Summary unavailable (LLM_TIMEOUT). The provider did not finish before the summary request timed out.",
    message:
      "The summary provider did not finish before the request timed out.",
    title: "Summary request timed out",
  },
};

export function createArticleSummaryFailure(input: {
  diagnostics?: ArticleSummaryFailureDiagnostics;
  errorCode: ArticleSummaryErrorCode;
  retryable: boolean;
}): ArticleSummaryFailure {
  return {
    diagnostics: input.diagnostics ?? {},
    errorCode: input.errorCode,
    retryable: input.retryable,
  };
}

export function isArticleSummaryErrorCode(
  value: string,
): value is ArticleSummaryErrorCode {
  return (ARTICLE_SUMMARY_ERROR_CODES as readonly string[]).includes(value);
}

export function toArticleSummarySafeError(
  storedReason: string | null | undefined,
): ArticleSummarySafeError | null {
  const normalizedReason = storedReason?.trim();

  if (!normalizedReason) {
    return null;
  }

  const code = isArticleSummaryErrorCode(normalizedReason)
    ? normalizedReason
    : "LLM_PROVIDER_FAILED";

  return {
    code,
    ...SAFE_ERROR_COPY[code],
  };
}
