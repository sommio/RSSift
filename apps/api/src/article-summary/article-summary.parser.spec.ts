import { describe, expect, it } from "@jest/globals";

import { ArticleSummaryParser } from "./article-summary.parser";

describe("ArticleSummaryParser", () => {
  const parser = new ArticleSummaryParser();

  it("normalizes key casing and spacing into canonical markdown", () => {
    const result = parser.parse({
      " key points ": ["Point one", "Point two", "Point three"],
      " summary ": "A concise summary paragraph.",
      " TITLE ": "翻译后的标题",
    });

    expect(result).toEqual({
      ok: true,
      summary: `## Title

翻译后的标题

## Summary

A concise summary paragraph.

## Key Points

1. Point one
2. Point two
3. Point three`,
      translatedTitle: "翻译后的标题",
    });
  });

  it("accepts key point lists that are shorter or longer than three items", () => {
    expect(
      parser.parse({
        keyPoints: ["One", "Two"],
        summary: "Short list still valid.",
        translatedTitle: "短列表",
      }),
    ).toMatchObject({
      ok: true,
    });

    expect(
      parser.parse({
        keyPoints: ["One", "Two", "Three", "Four", "Five", "Six"],
        summary: "Longer list still valid.",
        translatedTitle: "长列表",
      }),
    ).toMatchObject({
      ok: true,
    });
  });

  it("fails when translated title is missing", () => {
    expect(
      parser.parse({
        keyPoints: ["One", "Two", "Three"],
        summary: "Summary only",
      }),
    ).toEqual({
      ok: false,
      reason: "invalid_summary_payload",
    });
  });
});
