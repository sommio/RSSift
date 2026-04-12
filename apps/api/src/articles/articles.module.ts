import { Module } from "@nestjs/common";

import { ArticleFixtureRepository } from "./article-fixture.repository";
import { ArticlesController } from "./articles.controller";
import { ArticlesService } from "./articles.service";

@Module({
  controllers: [ArticlesController],
  providers: [ArticleFixtureRepository, ArticlesService],
})
export class ArticlesModule {}
