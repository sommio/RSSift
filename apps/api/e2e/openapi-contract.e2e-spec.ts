import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";

import { ArticlesController } from "../src/articles/articles.controller";
import { ArticlesService } from "../src/articles/articles.service";
import { HealthController } from "../src/health/health.controller";
import { PrismaService } from "../src/prisma/prisma.service";
import { createOpenApiDocument } from "../src/openapi/openapi-document";

describe("OpenAPI contract", () => {
  let app: INestApplication | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ArticlesController, HealthController],
      providers: [
        {
          provide: ArticlesService,
          useValue: {
            getArticleById: jest.fn(),
            getArticles: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            $queryRawUnsafe: jest.fn(),
          },
        },
      ],
    }).compile();

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
          process.cwd(),
          "../../packages/api-contract/openapi/openapi.yaml",
        ),
        "utf8",
      ),
    );

    expect(emitted).toEqual(checkedIn);
  });
});
