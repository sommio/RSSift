import { Injectable } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type PreparedArticleFixtureItem = {
  id: string;
  title: string;
  sourceTitle: string;
  publishedAt: string;
  summary: string;
  originalUrl: string;
};

function getFixturePath() {
  return join(__dirname, "fixtures", "prepared-articles.json");
}

@Injectable()
export class ArticleFixtureRepository {
  private readonly items: PreparedArticleFixtureItem[] = this.loadFixture();

  findAll(): PreparedArticleFixtureItem[] {
    return this.items;
  }

  findById(id: string): PreparedArticleFixtureItem | null {
    return this.items.find((item) => item.id === id) ?? null;
  }

  private loadFixture(): PreparedArticleFixtureItem[] {
    try {
      const fixtureRaw = readFileSync(getFixturePath(), "utf-8");
      return JSON.parse(fixtureRaw) as PreparedArticleFixtureItem[];
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown fixture read error";

      throw new Error(
        `Failed to load prepared article fixtures from ${getFixturePath()}: ${message}`,
      );
    }
  }
}
