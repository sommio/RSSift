import { Module } from "@nestjs/common";

import { ArticleContentModule } from "../article-content/article-content.module";
import { ArticleIdentityService } from "./article-identity.service";
import { FeedBootstrapService } from "./feed-bootstrap.service";
import { FeedIngestionService } from "./feed-ingestion.service";

@Module({
  imports: [ArticleContentModule],
  providers: [
    ArticleIdentityService,
    FeedBootstrapService,
    FeedIngestionService,
  ],
})
export class FeedsModule {}
