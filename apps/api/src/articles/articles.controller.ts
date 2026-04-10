import { Controller, Get, NotFoundException, Param } from "@nestjs/common";

import { ArticleDetailItemDto } from "./dto/article-detail-item.dto";
import { ArticleListItemDto } from "./dto/article-list-item.dto";
import { ArticlesService } from "./articles.service";

@Controller("articles")
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  getArticles(): ArticleListItemDto[] {
    return this.articlesService.getArticles();
  }

  @Get(":id")
  getArticleById(@Param("id") id: string): ArticleDetailItemDto {
    const article = this.articlesService.getArticleById(id);

    if (!article) {
      throw new NotFoundException("Article not found");
    }

    return article;
  }
}
