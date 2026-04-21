import { Test } from "@nestjs/testing";
import { describe, expect, it, jest } from "@jest/globals";

import { PrismaService } from "../prisma/prisma.service";
import { HealthController } from "./health.controller";

type QueryRawUnsafe = (query: string) => Promise<unknown>;
type StatusHandler = (statusCode: number) => ResponseMock;
type ResponseMock = {
  status: jest.MockedFunction<StatusHandler>;
};

function createResponseMock(): ResponseMock {
  const response = {} as ResponseMock;
  response.status = jest.fn<StatusHandler>().mockImplementation(() => response);

  return response;
}

describe("HealthController", () => {
  it("returns a stable liveness payload after startup", async () => {
    const queryRawUnsafe = jest.fn<QueryRawUnsafe>();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRawUnsafe: queryRawUnsafe,
          },
        },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);

    expect(controller.live()).toEqual({
      checks: {
        application: "live",
      },
      service: "api",
      status: "ok",
    });
  });

  it("reports starting until application bootstrap completes", async () => {
    const queryRawUnsafe = jest.fn<QueryRawUnsafe>();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRawUnsafe: queryRawUnsafe,
          },
        },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const response = createResponseMock();

    await expect(controller.ready(response as never)).resolves.toEqual({
      checks: {
        application: "starting",
        database: "unknown",
      },
      service: "api",
      status: "error",
    });
    expect(response.status).toHaveBeenCalledWith(503);
  });

  it("returns readiness only after bootstrap and a successful database ping", async () => {
    const queryRawUnsafe = jest.fn<QueryRawUnsafe>();
    queryRawUnsafe.mockResolvedValue([{ ready: 1 }]);
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRawUnsafe: queryRawUnsafe,
          },
        },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    controller.onApplicationBootstrap();
    const response = createResponseMock();

    await expect(controller.ready(response as never)).resolves.toEqual({
      checks: {
        application: "ready",
        database: "up",
      },
      service: "api",
      status: "ok",
    });
    expect(queryRawUnsafe).toHaveBeenCalledWith("SELECT 1");
    expect(response.status).not.toHaveBeenCalled();
  });

  it("returns a failing readiness payload when the database is unavailable", async () => {
    const queryRawUnsafe = jest.fn<QueryRawUnsafe>();
    queryRawUnsafe.mockRejectedValue(new Error("database unavailable"));
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRawUnsafe: queryRawUnsafe,
          },
        },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    controller.onApplicationBootstrap();
    const response = createResponseMock();

    await expect(controller.ready(response as never)).resolves.toEqual({
      checks: {
        application: "ready",
        database: "down",
      },
      service: "api",
      status: "error",
    });
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
