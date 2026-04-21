import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { prepareTestDatabase } from "../test-support/database";

let app: INestApplication;

beforeAll(async () => {
  process.env["TEST_DATABASE_URL"] ??=
    "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
  process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"];
  process.env["INGEST_ON_BOOT"] = "false";

  await prepareTestDatabase();

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe("Health endpoints", () => {
  it("GET /health/live returns a liveness payload without touching the database", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get("/health/live").expect(200);

    expect(response.body).toEqual({
      checks: {
        application: "live",
      },
      service: "api",
      status: "ok",
    });
  });

  it("GET /health/ready returns ready only when the database is reachable", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server).get("/health/ready").expect(200);

    expect(response.body).toEqual({
      checks: {
        application: "ready",
        database: "up",
      },
      service: "api",
      status: "ok",
    });
  });

  it("GET /health/ready returns 503 when the readiness database ping fails", async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const prisma = app.get(PrismaService);
    const querySpy = jest
      .spyOn(prisma, "$queryRawUnsafe")
      .mockRejectedValueOnce(new Error("database unavailable"));

    const response = await request(server).get("/health/ready").expect(503);

    expect(response.body).toEqual({
      checks: {
        application: "ready",
        database: "down",
      },
      service: "api",
      status: "error",
    });

    querySpy.mockRestore();
  });
});
