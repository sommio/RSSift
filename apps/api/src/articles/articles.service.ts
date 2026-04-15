import { Injectable } from "@nestjs/common";

import { ArticleRepository } from "./article.repository";
import { ArticleDetailItemDto } from "./dto/article-detail-item.dto";
import { ArticleListItemDto } from "./dto/article-list-item.dto";

@Injectable()
export class ArticlesService {
  constructor(private readonly articleRepository: ArticleRepository) {}

  async getArticles(): Promise<ArticleListItemDto[]> {
    const rows = await this.articleRepository.findAll();

    return rows.map((item) => ({
      id: item.id,
      title: item.title,
      sourceTitle: item.sourceTitle,
      publishedAt: item.publishedAt,
      originalUrl: item.originalUrl,
    }));
  }

  async getArticleById(id: string): Promise<ArticleDetailItemDto | null> {
    const item = await this.articleRepository.findById(id);

    if (!item) {
      return null;
    }

    return {
      title: item.title,
      sourceTitle: item.sourceTitle,
      publishedAt: item.publishedAt,
      summary: item.summary,
      originalUrl: item.originalUrl,
    };
  }
}
