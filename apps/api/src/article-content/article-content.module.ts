import { Module } from "@nestjs/common";

import { ArticleContentController } from "./article-content.controller";
import { ArticleContentExtractionService } from "./article-content-extraction.service";
import { ArticleContentRepository } from "./article-content.repository";
import { ArticleContentService } from "./article-content.service";

@Module({
  controllers: [ArticleContentController],
  providers: [
    ArticleContentExtractionService,
    ArticleContentRepository,
    ArticleContentService,
  ],
  exports: [ArticleContentExtractionService, ArticleContentService],
})
export class ArticleContentModule {}
