import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

type ArticleContentRecord = {
  contentMarkdown: string | null;
  id: string;
  originalUrl: string;
};

@Injectable()
export class ArticleContentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ArticleContentRecord | null> {
    const row = await this.prisma.article.findUnique({
      where: {
        id,
      },
      select: {
        contentMarkdown: true,
        id: true,
        originalUrl: true,
      },
    });

    if (!row) {
      return null;
    }

    return row;
  }

  async saveExtractedContent(input: {
    articleId: string;
    contentMarkdown: string;
    extractedAt: Date;
  }) {
    await this.prisma.article.update({
      where: {
        id: input.articleId,
      },
      data: {
        contentExtractedAt: input.extractedAt,
        contentMarkdown: input.contentMarkdown,
      },
    });
  }
}
