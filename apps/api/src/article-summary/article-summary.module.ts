import { Module } from "@nestjs/common";

import { ArticleSummaryBootstrapService } from "./article-summary-bootstrap.service";
import { ArticleSummaryGateway } from "./article-summary.gateway";
import { ArticleSummaryParser } from "./article-summary.parser";
import { ArticleSummaryRepository } from "./article-summary.repository";
import { ArticleSummaryService } from "./article-summary.service";

@Module({
  providers: [
    ArticleSummaryBootstrapService,
    ArticleSummaryGateway,
    ArticleSummaryParser,
    ArticleSummaryRepository,
    ArticleSummaryService,
  ],
  exports: [ArticleSummaryBootstrapService, ArticleSummaryService],
})
export class ArticleSummaryModule {}
