import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

const FEED_AUTO_REFRESH_STATE_ID = "global";

@Injectable()
export class FeedAutoRefreshRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getLastSuccessfulAutoRefreshAt(): Promise<Date | null> {
    const row = await this.prisma.feedAutoRefreshState.findUnique({
      where: {
        id: FEED_AUTO_REFRESH_STATE_ID,
      },
      select: {
        lastSuccessfulAutoRefreshAt: true,
      },
    });

    return row?.lastSuccessfulAutoRefreshAt ?? null;
  }

  async markSuccessfulAutoRefresh(at: Date) {
    await this.prisma.feedAutoRefreshState.upsert({
      where: {
        id: FEED_AUTO_REFRESH_STATE_ID,
      },
      create: {
        id: FEED_AUTO_REFRESH_STATE_ID,
        lastSuccessfulAutoRefreshAt: at,
      },
      update: {
        lastSuccessfulAutoRefreshAt: at,
      },
    });
  }
}
