import { Injectable } from "@nestjs/common";

import { ArticleFixtureRepository } from "./article-fixture.repository";
import { ArticleDetailItemDto } from "./dto/article-detail-item.dto";
import { ArticleListItemDto } from "./dto/article-list-item.dto";

@Injectable()
export class ArticlesService {
  constructor(
    private readonly articleFixtureRepository: ArticleFixtureRepository,
  ) {}

  getArticles(): ArticleListItemDto[] {
    return this.articleFixtureRepository.findAll().map((item) => ({
      id: item.id,
      title: item.title,
      sourceTitle: item.sourceTitle,
      publishedAt: item.publishedAt,
      originalUrl: item.originalUrl,
    }));
  }

  getArticleById(id: string): ArticleDetailItemDto | null {
    const item = this.articleFixtureRepository.findById(id);

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
