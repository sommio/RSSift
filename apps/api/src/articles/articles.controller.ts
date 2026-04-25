import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";

import { ArticleDetailItemDto } from "./dto/article-detail-item.dto";
import { ArticleListItemDto } from "./dto/article-list-item.dto";
import { ArticlesService } from "./articles.service";

@ApiTags("articles")
@Controller("articles")
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  @ApiOperation({ operationId: "articles" })
  @ApiOkResponse({ type: ArticleListItemDto, isArray: true })
  async getArticles(): Promise<ArticleListItemDto[]> {
    return this.articlesService.getArticles();
  }

  @Get(":id")
  @ApiOperation({ operationId: "articleById" })
  @ApiParam({ name: "id", required: true, type: String })
  @ApiOkResponse({ type: ArticleDetailItemDto })
  @ApiNotFoundResponse({ description: "Article not found" })
  async getArticleById(@Param("id") id: string): Promise<ArticleDetailItemDto> {
    const article = await this.articlesService.getArticleById(id);

    if (!article) {
      throw new NotFoundException("Article not found");
    }

    return article;
  }
}
