import { Module } from "@nestjs/common";

import { ArticleRepository } from "./article.repository";
import { ArticlesController } from "./articles.controller";
import { ArticlesService } from "./articles.service";

@Module({
  controllers: [ArticlesController],
  providers: [ArticleRepository, ArticlesService],
})
export class ArticlesModule {}
