import { Injectable, Logger } from "@nestjs/common";
import { parseFeed, parseOpml } from "feedsmith";
import { readFile } from "node:fs/promises";

import { ArticleContentService } from "../article-content/article-content.service";
import { ArticleSummaryService } from "../article-summary/article-summary.service";
import { getAppConfig } from "../config/app-config";
import { PrismaService } from "../prisma/prisma.service";
import { ArticleIdentityService } from "./article-identity.service";
import {
  getFeedItems,
  getFeedSiteUrl,
  getFeedTitle,
  getItemPublishedAt,
  getItemSummary,
  getItemUrl,
  getSourceId,
  toDate,
} from "./feed-ingestion.parsers";
import {
  FeedIngestionOptions,
  FeedIngestionRunResult,
  FeedIngestionTrigger,
  FeedRequestError,
} from "./feed-ingestion.types";

type FeedDescriptor = {
  feedUrl: string;
  title: string | null;
  websiteUrl: string | null;
};

type NormalizedArticle = {
  identityHash: string;
  identitySourceType: "SOURCE_ID" | "CANONICAL_URL" | "CONTENT_SIGNATURE";
  identitySourceValue: string;
  ingestedAt: Date;
  originalUrl: string;
  publishedAt: Date | null;
  sourceId: string | null;
  title: string;
};

const PER_FEED_TIMEOUT_MS = 15_000;
const OVERALL_TIMEOUT_MS = 45_000;

@Injectable()
export class FeedIngestionService {
  private readonly logger = new Logger(FeedIngestionService.name);
  private readonly maxArticlesPerFeed = getAppConfig().feedMaxArticlesPerFeed;

  constructor(
    private readonly prisma: PrismaService,
    private readonly articleIdentityService: ArticleIdentityService,
    private readonly articleContentService: ArticleContentService,
    private readonly articleSummaryService: ArticleSummaryService,
  ) {}

  async ingestFromOpml(
    opmlPath: string,
    options: FeedIngestionOptions = {},
  ): Promise<FeedIngestionRunResult> {
    const subscriptions = await this.readFeedDescriptors(opmlPath);
    const startedAt = Date.now();
    const trigger = options.trigger ?? "bootstrap";
    const maxAttemptsPerFeed = Math.max(1, options.maxAttemptsPerFeed ?? 1);
    let successCount = 0;
    let failedCount = 0;

    for (const descriptor of subscriptions) {
      const remainingBudget = OVERALL_TIMEOUT_MS - (Date.now() - startedAt);

      if (remainingBudget <= 0) {
        failedCount += 1;
        this.logFeedEvent({
          feedUrl: descriptor.feedUrl,
          trigger,
          status: "timeout",
          reason: "overall_budget_exhausted",
        });
        continue;
      }

      try {
        await this.ingestSingleFeedWithRetries(
          descriptor,
          startedAt,
          maxAttemptsPerFeed,
          trigger,
        );
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        this.logFeedEvent({
          feedUrl: descriptor.feedUrl,
          trigger,
          status: "failed",
          reason:
            error instanceof Error
              ? error.message
              : "Unknown ingestion failure",
        });
      }
    }

    const summaryStatus =
      successCount === 0
        ? "full_failure"
        : failedCount === 0
          ? "all_success"
          : "partial_success";

    this.logger.log(
      JSON.stringify({
        scope: "feed_ingestion_summary",
        trigger,
        status: summaryStatus,
        successCount,
        failedCount,
        totalFeeds: subscriptions.length,
      }),
    );

    return {
      failedCount,
      status: summaryStatus,
      successCount,
      totalFeeds: subscriptions.length,
      trigger,
    };
  }

  async readFeedDescriptors(opmlPath: string): Promise<FeedDescriptor[]> {
    const opmlRaw = await readFile(opmlPath, "utf8");
    const parsed = parseOpml(opmlRaw);
    const descriptors: FeedDescriptor[] = [];

    const visit = (outlines: Array<Record<string, unknown>> | undefined) => {
      for (const outline of outlines ?? []) {
        const feedUrl = this.getString(outline["xmlUrl"]);

        if (feedUrl) {
          descriptors.push({
            feedUrl,
            title:
              this.getString(outline["title"]) ??
              this.getString(outline["text"]),
            websiteUrl: this.getString(outline["htmlUrl"]),
          });
        }

        visit(
          Array.isArray(outline["outlines"])
            ? (outline["outlines"] as Array<Record<string, unknown>>)
            : undefined,
        );
      }
    };

    visit(
      Array.isArray(parsed.body?.outlines)
        ? (parsed.body.outlines as Array<Record<string, unknown>>)
        : undefined,
    );

    return descriptors;
  }

  private async ingestSingleFeedWithRetries(
    descriptor: FeedDescriptor,
    runStartedAt: number,
    maxAttemptsPerFeed: number,
    trigger: FeedIngestionTrigger,
  ) {
    let attempt = 0;

    while (attempt < maxAttemptsPerFeed) {
      attempt += 1;
      const remainingBudget = OVERALL_TIMEOUT_MS - (Date.now() - runStartedAt);

      if (remainingBudget <= 0) {
        throw new FeedRequestError("overall_budget_exhausted", false);
      }

      try {
        await this.ingestSingleFeed(
          descriptor,
          Math.min(PER_FEED_TIMEOUT_MS, remainingBudget),
          trigger,
        );
        return;
      } catch (error) {
        const normalizedError = this.normalizeFeedError(error);

        if (!normalizedError.retryable || attempt >= maxAttemptsPerFeed) {
          throw normalizedError;
        }

        this.logFeedEvent({
          attempt,
          feedUrl: descriptor.feedUrl,
          maxAttemptsPerFeed,
          reason: normalizedError.message,
          status: "retrying",
          trigger,
        });
      }
    }
  }

  private async ingestSingleFeed(
    descriptor: FeedDescriptor,
    timeoutMs: number,
    trigger: FeedIngestionTrigger,
  ) {
    const deadlineAt = Date.now() + timeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(descriptor.feedUrl, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new FeedRequestError(
          `Feed request failed with status ${String(response.status)}`,
          response.status >= 500,
        );
      }

      const feedBody = await response.text();
      const parsedFeed = parseFeed(feedBody);
      const ingestedAt = new Date();
      const normalizedArticles = this.normalizeArticles(
        descriptor.feedUrl,
        parsedFeed,
        ingestedAt,
      );
      const persistence = await this.persistNormalizedArticles({
        descriptor,
        normalizedArticles,
        parsedFeed,
        response,
      });
      const articleIdsToEnrich = persistence.articleIdsToEnrich;

      await this.enrichArticles(articleIdsToEnrich, deadlineAt);
      this.refreshSummaries(persistence.articleIdsToRefresh);

      this.logFeedEvent({
        feedUrl: descriptor.feedUrl,
        trigger,
        status: "success",
        articleCount: normalizedArticles.length,
      });
    } catch (error) {
      throw this.normalizeFeedError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeArticles(
    _feedUrl: string,
    parsedFeed: ReturnType<typeof parseFeed>,
    ingestedAt: Date,
  ): NormalizedArticle[] {
    const items = getFeedItems(parsedFeed);

    return items
      .map((item, index) => {
        const sourceId = getSourceId(item);
        const originalUrl =
          this.articleIdentityService.normalizeCanonicalUrl(
            getItemUrl(item) ?? undefined,
          ) ?? "";
        const publishedAt = toDate(getItemPublishedAt(item));
        const summary = getItemSummary(item);
        const title =
          this.getString(item["title"]) ?? (originalUrl || "Untitled article");
        const identity = this.articleIdentityService.deriveIdentity({
          canonicalUrl: originalUrl || undefined,
          description: summary,
          publishedAt: publishedAt?.toISOString() ?? null,
          sourceId: sourceId || undefined,
          title,
        });

        return {
          index,
          normalized: {
            ...identity,
            ingestedAt,
            originalUrl,
            publishedAt,
            title,
          },
          publishedAt,
        };
      })
      .sort((left, right) => {
        const leftPublishedAt =
          left.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
        const rightPublishedAt =
          right.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;

        if (leftPublishedAt !== rightPublishedAt) {
          return rightPublishedAt - leftPublishedAt;
        }

        return left.index - right.index;
      })
      .slice(0, this.maxArticlesPerFeed)
      .map(({ normalized }) => normalized);
  }

  private getString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private normalizeFeedError(error: unknown) {
    if (error instanceof FeedRequestError) {
      return error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      return new FeedRequestError("Feed request timed out", true);
    }

    if (error instanceof TypeError) {
      return new FeedRequestError(error.message, true);
    }

    if (error instanceof Error) {
      return new FeedRequestError(error.message, false);
    }

    return new FeedRequestError("Unknown ingestion failure", false);
  }

  private logFeedEvent(payload: Record<string, unknown>) {
    this.logger.log(
      JSON.stringify({
        scope: "feed_ingestion",
        ...payload,
      }),
    );
  }

  private async enrichArticles(articleIds: string[], deadlineAt: number) {
    for (const articleId of articleIds) {
      const remainingBudgetMs = deadlineAt - Date.now();

      if (remainingBudgetMs <= 0) {
        this.logger.warn(
          JSON.stringify({
            articleId,
            reason: "feed_budget_exhausted",
            scope: "feed_ingestion_article_content",
            status: "skipped",
          }),
        );
        break;
      }

      const result = await this.articleContentService.tryPersistArticleContent(
        articleId,
        {
          timeoutMs: remainingBudgetMs,
        },
      );

      this.logger.log(
        JSON.stringify({
          articleId,
          scope: "feed_ingestion_article_content",
          ...result,
        }),
      );
    }
  }

  private async persistNormalizedArticles(input: {
    descriptor: FeedDescriptor;
    normalizedArticles: NormalizedArticle[];
    parsedFeed: ReturnType<typeof parseFeed>;
    response: Response;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const feed = await tx.feed.upsert({
        where: {
          feedUrl: input.descriptor.feedUrl,
        },
        create: {
          feedUrl: input.descriptor.feedUrl,
          siteTitle: getFeedTitle(input.parsedFeed) ?? input.descriptor.title,
          siteUrl:
            getFeedSiteUrl(input.parsedFeed) ?? input.descriptor.websiteUrl,
          etag: input.response.headers.get("etag"),
          lastModified: input.response.headers.get("last-modified"),
        },
        update: {
          siteTitle: getFeedTitle(input.parsedFeed) ?? input.descriptor.title,
          siteUrl:
            getFeedSiteUrl(input.parsedFeed) ?? input.descriptor.websiteUrl,
          etag: input.response.headers.get("etag"),
          lastModified: input.response.headers.get("last-modified"),
        },
      });
      const articleIdsToEnrich: string[] = [];
      const articleIdsToRefresh: string[] = [];

      for (const article of input.normalizedArticles) {
        const existing = await tx.article.findFirst({
          where: {
            feedId: feed.id,
            OR: [
              article.sourceId ? { sourceId: article.sourceId } : undefined,
              article.originalUrl
                ? { originalUrl: article.originalUrl }
                : undefined,
              { identityHash: article.identityHash },
            ].filter(Boolean) as Array<Record<string, unknown>>,
          },
        });

        if (existing) {
          const titleChanged =
            existing.contentMarkdown !== null &&
            existing.title !== article.title;

          await tx.article.update({
            where: {
              id: existing.id,
            },
            data: {
              title: article.title,
              originalUrl: article.originalUrl,
              publishedAt: article.publishedAt,
              ingestedAt: article.ingestedAt,
              sourceId: existing.sourceId ?? article.sourceId,
            },
          });
          if (!existing.contentMarkdown) {
            articleIdsToEnrich.push(existing.id);
          } else if (titleChanged) {
            articleIdsToRefresh.push(existing.id);
          }
          continue;
        }

        const created = await tx.article.create({
          data: {
            feedId: feed.id,
            identityHash: article.identityHash,
            identitySourceType: article.identitySourceType,
            identitySourceValue: article.identitySourceValue,
            ingestedAt: article.ingestedAt,
            originalUrl: article.originalUrl,
            publishedAt: article.publishedAt,
            sourceId: article.sourceId,
            title: article.title,
          },
        });
        articleIdsToEnrich.push(created.id);
      }

      return {
        articleIdsToEnrich,
        articleIdsToRefresh,
      };
    });
  }

  private refreshSummaries(articleIds: string[]) {
    for (const articleId of articleIds) {
      const result = this.articleSummaryService.schedule(
        articleId,
        "title_changed",
      );

      this.logger.log(
        JSON.stringify({
          articleId,
          scope: "feed_ingestion_article_summary",
          ...result,
        }),
      );
    }
  }
}
