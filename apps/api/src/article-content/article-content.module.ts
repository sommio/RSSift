import { Module } from "@nestjs/common";

import { ArticleSummaryModule } from "../article-summary/article-summary.module";
import { ArticleContentExtractionService } from "./article-content-extraction.service";
import { ArticleContentRepository } from "./article-content.repository";
import { ArticleContentService } from "./article-content.service";

@Module({
  imports: [ArticleSummaryModule],
  providers: [
    ArticleContentExtractionService,
    ArticleContentRepository,
    ArticleContentService,
  ],
  exports: [ArticleContentExtractionService, ArticleContentService],
})
export class ArticleContentModule {}
