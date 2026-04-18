import { Injectable } from "@nestjs/common";
import { z } from "zod";

const articleSummarySchema = z.object({
  keyPoints: z.array(z.string().trim().min(1)).min(1),
  summary: z.string().trim().min(1),
  translatedTitle: z.string().trim().min(1),
});

type ArticleSummaryParseResult =
  | {
      ok: true;
      summary: string;
      translatedTitle: string;
    }
  | {
      ok: false;
      reason: "invalid_summary_payload";
    };

@Injectable()
export class ArticleSummaryParser {
  parse(input: unknown): ArticleSummaryParseResult {
    const normalizedInput =
      input && typeof input === "object" ? this.normalizeObject(input) : input;
    const parsed = articleSummarySchema.safeParse(normalizedInput);

    if (!parsed.success) {
      return {
        ok: false,
        reason: "invalid_summary_payload",
      };
    }

    return {
      ok: true,
      summary: this.toCanonicalMarkdown(parsed.data),
      translatedTitle: parsed.data.translatedTitle,
    };
  }

  private normalizeObject(input: object) {
    const normalizedEntries = Object.entries(input).map(([key, value]) => {
      const normalizedKey = key.trim().toLowerCase().replaceAll(/\s+/g, "");

      if (normalizedKey === "title" || normalizedKey === "translatedtitle") {
        return ["translatedTitle", value] as const;
      }

      if (normalizedKey === "summary") {
        return ["summary", value] as const;
      }

      if (normalizedKey === "keypoints") {
        return ["keyPoints", value] as const;
      }

      return [key, value] as const;
    });

    return Object.fromEntries(normalizedEntries);
  }

  private toCanonicalMarkdown(input: z.infer<typeof articleSummarySchema>) {
    const keyPoints = input.keyPoints
      .map((keyPoint, index) => `${String(index + 1)}. ${keyPoint}`)
      .join("\n");

    return `## Title

${input.translatedTitle}

## Summary

${input.summary}

## Key Points

${keyPoints}`;
  }
}
