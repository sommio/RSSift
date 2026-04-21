import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { ArticleContentModule } from "./article-content/article-content.module";
import { ArticleSummaryModule } from "./article-summary/article-summary.module";
import { ArticlesModule } from "./articles/articles.module";
import { getEnvFilePaths } from "./config/app-config";
import { validateEnv } from "./config/env.validation";
import { FeedsModule } from "./feeds/feeds.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: getEnvFilePaths(__dirname),
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    ArticleContentModule,
    ArticleSummaryModule,
    ArticlesModule,
    FeedsModule,
    HealthModule,
  ],
})
export class AppModule {}
