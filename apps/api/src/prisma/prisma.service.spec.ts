import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
  beforeEach(() => {
    process.env["DATABASE_URL"] =
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift";
    process.env["TEST_DATABASE_URL"] =
      "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test";
    jest.resetModules();
  });

  it("disconnects cleanly on module destroy", async () => {
    const service = new PrismaService();
    const disconnectSpy = jest
      .spyOn(service, "$disconnect")
      .mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
