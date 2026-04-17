import {
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";

import { ArticleContentService } from "./article-content.service";

@Controller("article-content")
export class ArticleContentController {
  constructor(private readonly articleContentService: ArticleContentService) {}

  @Post(":id/retry")
  @HttpCode(200)
  async retryArticleContent(@Param("id") id: string) {
    const result = await this.articleContentService.tryPersistArticleContent(
      id,
      {
        force: true,
      },
    );

    if (result.status === "skipped" && result.reason === "not_found") {
      throw new NotFoundException("Article not found");
    }

    return result;
  }
}
