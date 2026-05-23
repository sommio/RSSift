import { type INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ArticleDetailItemDto,
  ArticleSummaryErrorDto,
} from "../articles/dto/article-detail-item.dto";
import { ArticleListItemDto } from "../articles/dto/article-list-item.dto";
import {
  HealthLiveChecksDto,
  HealthLiveResponseDto,
  HealthReadyChecksDto,
  HealthReadyResponseDto,
} from "../health/dto/health-response.dto";

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../package.json"), "utf8"),
) as { version: string };

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("RSSift API")
    .setDescription("OpenAPI contract for the RSSift API surface")
    .setVersion(pkg.version)
    .build();

  return SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
    extraModels: [
      ArticleDetailItemDto,
      ArticleListItemDto,
      ArticleSummaryErrorDto,
      HealthLiveChecksDto,
      HealthLiveResponseDto,
      HealthReadyChecksDto,
      HealthReadyResponseDto,
    ],
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  });
}
