import { Module } from "@nestjs/common";

import { ArticleIdentityService } from "./article-identity.service";
import { FeedBootstrapService } from "./feed-bootstrap.service";
import { FeedIngestionService } from "./feed-ingestion.service";

@Module({
  providers: [
    ArticleIdentityService,
    FeedBootstrapService,
    FeedIngestionService,
  ],
})
export class FeedsModule {}
