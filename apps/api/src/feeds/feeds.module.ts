import { Module } from "@nestjs/common";

import { ArticleSummaryModule } from "../article-summary/article-summary.module";
import { ArticleContentModule } from "../article-content/article-content.module";
import { ArticleIdentityService } from "./article-identity.service";
import { FeedBootstrapService } from "./feed-bootstrap.service";
import { FeedIngestionService } from "./feed-ingestion.service";

@Module({
  imports: [ArticleContentModule, ArticleSummaryModule],
  providers: [
    ArticleIdentityService,
    FeedBootstrapService,
    FeedIngestionService,
  ],
})
export class FeedsModule {}
