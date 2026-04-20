export type FeedIngestionTrigger = "auto_refresh_resume" | "bootstrap";

export type FeedIngestionRunResult = {
  failedCount: number;
  status: "all_success" | "full_failure" | "partial_success";
  successCount: number;
  totalFeeds: number;
  trigger: FeedIngestionTrigger;
};

export type FeedIngestionOptions = {
  maxAttemptsPerFeed?: number;
  trigger?: FeedIngestionTrigger;
};

export class FeedRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "FeedRequestError";
  }
}
