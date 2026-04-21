import { Controller, Get, OnApplicationBootstrap, Res } from "@nestjs/common";
import type { Response } from "express";

import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController implements OnApplicationBootstrap {
  private appReady = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    this.appReady = true;
  }

  @Get("live")
  live() {
    return {
      checks: {
        application: "live",
      },
      service: "api",
      status: "ok",
    };
  }

  @Get("ready")
  async ready(@Res({ passthrough: true }) response: Response) {
    if (!this.appReady) {
      response.status(503);

      return {
        checks: {
          application: "starting",
          database: "unknown",
        },
        service: "api",
        status: "error",
      };
    }

    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");

      return {
        checks: {
          application: "ready",
          database: "up",
        },
        service: "api",
        status: "ok",
      };
    } catch {
      response.status(503);

      return {
        checks: {
          application: "ready",
          database: "down",
        },
        service: "api",
        status: "error",
      };
    }
  }
}
