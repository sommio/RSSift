import { Injectable, Logger } from "@nestjs/common";
import { parseFeed, parseOpml } from "feedsmith";
import { readFile } from "node:fs/promises";

import { PrismaService } from "../prisma/prisma.service";
import { ArticleIdentityService } from "./article-identity.service";

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
  summary: string;
  title: string;
};

const PER_FEED_TIMEOUT_MS = 15_000;
const OVERALL_TIMEOUT_MS = 45_000;

@Injectable()
export class FeedIngestionService {
  private readonly logger = new Logger(FeedIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly articleIdentityService: ArticleIdentityService,
  ) {}

  async ingestFromOpml(opmlPath: string) {
    const subscriptions = await this.readFeedDescriptors(opmlPath);
    const startedAt = Date.now();
    let successCount = 0;
    let failedCount = 0;

    for (const descriptor of subscriptions) {
      const remainingBudget = OVERALL_TIMEOUT_MS - (Date.now() - startedAt);

      if (remainingBudget <= 0) {
        failedCount += 1;
        this.logFeedEvent({
          feedUrl: descriptor.feedUrl,
          status: "timeout",
          reason: "overall_budget_exhausted",
        });
        continue;
      }

      try {
        await this.ingestSingleFeed(
          descriptor,
          Math.min(PER_FEED_TIMEOUT_MS, remainingBudget),
        );
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        this.logFeedEvent({
          feedUrl: descriptor.feedUrl,
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
        status: summaryStatus,
        successCount,
        failedCount,
        totalFeeds: subscriptions.length,
      }),
    );
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

  private async ingestSingleFeed(
    descriptor: FeedDescriptor,
    timeoutMs: number,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(descriptor.feedUrl, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Feed request failed with status ${String(response.status)}`,
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

      await this.prisma.$transaction(async (tx) => {
        const feed = await tx.feed.upsert({
          where: {
            feedUrl: descriptor.feedUrl,
          },
          create: {
            feedUrl: descriptor.feedUrl,
            siteTitle: this.getFeedTitle(parsedFeed) ?? descriptor.title,
            siteUrl: this.getFeedSiteUrl(parsedFeed) ?? descriptor.websiteUrl,
            etag: response.headers.get("etag"),
            lastModified: response.headers.get("last-modified"),
          },
          update: {
            siteTitle: this.getFeedTitle(parsedFeed) ?? descriptor.title,
            siteUrl: this.getFeedSiteUrl(parsedFeed) ?? descriptor.websiteUrl,
            etag: response.headers.get("etag"),
            lastModified: response.headers.get("last-modified"),
          },
        });

        for (const article of normalizedArticles) {
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
            await tx.article.update({
              where: {
                id: existing.id,
              },
              data: {
                title: article.title,
                originalUrl: article.originalUrl,
                publishedAt: article.publishedAt,
                summary: article.summary,
                ingestedAt: article.ingestedAt,
                sourceId: existing.sourceId ?? article.sourceId,
              },
            });

            continue;
          }

          await tx.article.create({
            data: {
              feedId: feed.id,
              identityHash: article.identityHash,
              identitySourceType: article.identitySourceType,
              identitySourceValue: article.identitySourceValue,
              ingestedAt: article.ingestedAt,
              originalUrl: article.originalUrl,
              publishedAt: article.publishedAt,
              sourceId: article.sourceId,
              summary: article.summary,
              title: article.title,
            },
          });
        }
      });

      this.logFeedEvent({
        feedUrl: descriptor.feedUrl,
        status: "success",
        articleCount: normalizedArticles.length,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeArticles(
    feedUrl: string,
    parsedFeed: ReturnType<typeof parseFeed>,
    ingestedAt: Date,
  ): NormalizedArticle[] {
    const items = this.getFeedItems(parsedFeed);

    return items.map((item) => {
      const sourceId = this.getSourceId(item);
      const originalUrl =
        this.articleIdentityService.normalizeCanonicalUrl(
          this.getItemUrl(item) ?? undefined,
        ) ?? "";
      const publishedAt = this.toDate(this.getItemPublishedAt(item));
      const summary = this.getItemSummary(item);
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
        ...identity,
        ingestedAt,
        originalUrl,
        publishedAt,
        summary,
        title,
      };
    });
  }

  private getFeedItems(parsedFeed: ReturnType<typeof parseFeed>) {
    if (parsedFeed.format === "rss" || parsedFeed.format === "json") {
      return (parsedFeed.feed.items ?? []) as Array<Record<string, unknown>>;
    }

    if (parsedFeed.format === "atom") {
      return (parsedFeed.feed.entries ?? []) as Array<Record<string, unknown>>;
    }

    return (parsedFeed.feed.items ?? []) as Array<Record<string, unknown>>;
  }

  private getFeedTitle(parsedFeed: ReturnType<typeof parseFeed>) {
    return this.getString(parsedFeed.feed.title);
  }

  private getFeedSiteUrl(parsedFeed: ReturnType<typeof parseFeed>) {
    if (parsedFeed.format === "rss" || parsedFeed.format === "rdf") {
      return this.getString(parsedFeed.feed.link);
    }

    if (parsedFeed.format === "json") {
      return this.getString(parsedFeed.feed.home_page_url);
    }

    const alternateLink = parsedFeed.feed.links?.find(
      (entry) => entry.rel === "alternate" || !entry.rel,
    );

    return this.getString(alternateLink?.href);
  }

  private getSourceId(item: Record<string, unknown>) {
    const guid = item["guid"];

    if (typeof guid === "object" && guid !== null) {
      return this.getString((guid as Record<string, unknown>)["value"]);
    }

    return (
      this.getString(item["id"]) ??
      this.getString(item["guid"]) ??
      this.getString(item["itemGuid"])
    );
  }

  private getItemUrl(item: Record<string, unknown>) {
    if (Array.isArray(item["links"])) {
      const alternateLink = (
        item["links"] as Array<Record<string, unknown>>
      ).find(
        (entry) =>
          this.getString(entry["rel"]) === "alternate" || !entry["rel"],
      );

      const href = this.getString(alternateLink?.["href"]);

      if (href) {
        return href;
      }
    }

    return (
      this.getString(item["url"]) ??
      this.getString(item["external_url"]) ??
      this.getString(item["link"])
    );
  }

  private getItemPublishedAt(item: Record<string, unknown>) {
    return (
      this.getString(item["published"]) ??
      this.getString(item["updated"]) ??
      this.getString(item["date_published"]) ??
      this.getString(item["pubDate"])
    );
  }

  private getItemSummary(item: Record<string, unknown>) {
    return (
      this.getString(item["summary"]) ??
      this.getString(item["description"]) ??
      this.getString(item["content_text"]) ??
      this.getString(item["content_html"]) ??
      ""
    );
  }

  private toDate(value: string | null) {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private getString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private logFeedEvent(payload: Record<string, unknown>) {
    this.logger.log(
      JSON.stringify({
        scope: "feed_ingestion",
        ...payload,
      }),
    );
  }
}
