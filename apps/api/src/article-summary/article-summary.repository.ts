import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

type ArticleSummaryGenerationInput = {
  contentMarkdown: string;
  id: string;
  title: string;
};

@Injectable()
export class ArticleSummaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findGenerationInputById(
    articleId: string,
  ): Promise<ArticleSummaryGenerationInput | null> {
    const row = await this.prisma.article.findUnique({
      where: {
        id: articleId,
      },
      select: {
        contentMarkdown: true,
        id: true,
        title: true,
      },
    });

    if (!row?.contentMarkdown) {
      return null;
    }

    return {
      contentMarkdown: row.contentMarkdown,
      id: row.id,
      title: row.title,
    };
  }

  async findPendingCandidateIds(): Promise<string[]> {
    const rows = await this.prisma.article.findMany({
      where: {
        contentMarkdown: {
          not: null,
        },
        OR: [
          {
            summary: "",
          },
          {
            translatedTitle: "",
          },
        ],
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
      select: {
        id: true,
      },
    });

    return rows.map((row) => row.id);
  }

  async saveSummaryResult(input: {
    articleId: string;
    summary: string;
    translatedTitle: string;
  }) {
    await this.prisma.article.update({
      where: {
        id: input.articleId,
      },
      data: {
        summary: input.summary,
        summaryErrorReason: "",
        translatedTitle: input.translatedTitle,
      },
    });
  }

  async saveSummaryFailure(input: { articleId: string; reason: string }) {
    await this.prisma.article.update({
      where: {
        id: input.articleId,
      },
      data: {
        summary: "",
        summaryErrorReason: input.reason,
        translatedTitle: "",
      },
    });
  }
}
