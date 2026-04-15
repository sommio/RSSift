import { describe, expect, it } from "@jest/globals";

import { ArticleIdentityService } from "./article-identity.service";

describe("ArticleIdentityService", () => {
  const service = new ArticleIdentityService();

  it("prefers source id over every other identity fallback", () => {
    const identity = service.deriveIdentity({
      sourceId: "guid-1",
      canonicalUrl: "https://example.com/article#fragment",
      title: "Article",
    });

    expect(identity.identitySourceType).toBe("SOURCE_ID");
    expect(identity.identitySourceValue).toBe("guid-1");
    expect(identity.sourceId).toBe("guid-1");
  });

  it("falls back to canonical url when source id is absent", () => {
    const identity = service.deriveIdentity({
      canonicalUrl: "HTTPS://Example.com:443/article?x=1#fragment",
      title: "Article",
    });

    expect(identity.identitySourceType).toBe("CANONICAL_URL");
    expect(identity.identitySourceValue).toBe(
      "https://example.com/article?x=1",
    );
  });

  it("falls back to a deterministic content signature when source id and url are absent", () => {
    const identity = service.deriveIdentity({
      title: "  Article   title ",
      publishedAt: "2026-04-15T00:00:00.000Z",
      description: "  Summary   with   spaces ",
    });

    expect(identity.identitySourceType).toBe("CONTENT_SIGNATURE");
    expect(identity.identitySourceValue).toBe(
      "Article title\n2026-04-15T00:00:00.000Z\nSummary with spaces",
    );
  });
});
