import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { getAppConfig } from "../config/app-config";
import { PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const { databaseUrl } = getAppConfig();

    super({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
      log: ["error", "warn"],
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
