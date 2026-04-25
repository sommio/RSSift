 
import { Module } from "@nestjs/common";

import { ArticlesModule } from "../articles/articles.module";
import { FeedBootstrapService } from "../feeds/feed-bootstrap.service";
import { HealthModule } from "../health/health.module";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [ArticlesModule, HealthModule, PrismaModule],
  providers: [FeedBootstrapService],
})
export class OpenApiRefreshModule {}
