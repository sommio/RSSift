import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

type PersistedArticleListItem = {
  id: string;
  originalUrl: string;
  publishedAt: string;
  sourceTitle: string;
  title: string;
  translatedTitle: string;
};

type PersistedArticleDetailItem = PersistedArticleListItem & {
  summary: string;
  summaryErrorCode: string;
};

@Injectable()
export class ArticleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PersistedArticleListItem[]> {
    const rows = await this.prisma.article.findMany({
      include: {
        feed: true,
      },
      orderBy: [
        {
          publishedAt: "asc",
        },
        {
          ingestedAt: "asc",
        },
        {
          id: "asc",
        },
      ],
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      translatedTitle: row.translatedTitle,
      sourceTitle: row.feed.siteTitle ?? "",
      publishedAt: (row.publishedAt ?? row.ingestedAt).toISOString(),
      originalUrl: row.originalUrl,
    }));
  }

  async findById(id: string): Promise<PersistedArticleDetailItem | null> {
    const row = await this.prisma.article.findUnique({
      where: {
        id,
      },
      include: {
        feed: true,
      },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      title: row.title,
      translatedTitle: row.translatedTitle,
      sourceTitle: row.feed.siteTitle ?? "",
      publishedAt: (row.publishedAt ?? row.ingestedAt).toISOString(),
      originalUrl: row.originalUrl,
      summary: row.summary || "",
      summaryErrorCode: row.summaryErrorReason || "",
    };
  }
}
