import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";

import { AppModule } from "../src/app.module";
import { ArticlesService } from "../src/articles/articles.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { createOpenApiDocument } from "../src/openapi/openapi-document";
import { FeedBootstrapService } from "../src/feeds/feed-bootstrap.service";

describe("OpenAPI contract", () => {
  let app: INestApplication | undefined;

  beforeAll(async () => {
    process.env["TEST_DATABASE_URL"] ??=
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"];
    process.env["INGEST_ON_BOOT"] = "false";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ArticlesService)
      .useValue({
        getArticleById: jest.fn(),
        getArticles: jest.fn(),
      })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRawUnsafe: jest.fn(),
      })
      .overrideProvider(FeedBootstrapService)
      .useValue({
        onApplicationBootstrap: () => undefined,
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("matches the checked-in contract", () => {
    const emitted = createOpenApiDocument(app as INestApplication);
    const checkedIn: unknown = YAML.parse(
      readFileSync(
        resolve(
          __dirname,
          "../../../packages/api-contract/openapi/openapi.yaml",
        ),
        "utf8",
      ),
    );

    expect(emitted).toEqual(checkedIn);
  });
});
