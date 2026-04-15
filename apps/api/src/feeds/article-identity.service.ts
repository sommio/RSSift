import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";

type IdentityInput = {
  canonicalUrl?: string | undefined;
  description?: string | undefined;
  publishedAt?: string | null;
  sourceId?: string | undefined;
  title?: string | undefined;
};

export type DerivedIdentity = {
  identityHash: string;
  identitySourceType: "SOURCE_ID" | "CANONICAL_URL" | "CONTENT_SIGNATURE";
  identitySourceValue: string;
  sourceId: string | null;
};

function normalizeWhitespace(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

@Injectable()
export class ArticleIdentityService {
  normalizeCanonicalUrl(rawUrl: string | undefined) {
    const trimmed = rawUrl?.trim();

    if (!trimmed) {
      return null;
    }

    try {
      const url = new URL(trimmed);
      url.hash = "";

      if (
        (url.protocol === "http:" && url.port === "80") ||
        (url.protocol === "https:" && url.port === "443")
      ) {
        url.port = "";
      }

      if (!url.pathname) {
        url.pathname = "/";
      }

      url.hostname = url.hostname.toLowerCase();
      url.protocol = url.protocol.toLowerCase();

      return url.toString();
    } catch {
      return null;
    }
  }

  deriveIdentity(input: IdentityInput): DerivedIdentity {
    const sourceId = normalizeWhitespace(input.sourceId) || null;

    if (sourceId) {
      return {
        sourceId,
        identitySourceType: "SOURCE_ID",
        identitySourceValue: sourceId,
        identityHash: this.hash(`SOURCE_ID:${sourceId}`),
      };
    }

    const canonicalUrl = this.normalizeCanonicalUrl(input.canonicalUrl);

    if (canonicalUrl) {
      return {
        sourceId: null,
        identitySourceType: "CANONICAL_URL",
        identitySourceValue: canonicalUrl,
        identityHash: this.hash(`CANONICAL_URL:${canonicalUrl}`),
      };
    }

    const signature = [
      normalizeWhitespace(input.title),
      normalizeWhitespace(input.publishedAt ?? undefined),
      normalizeWhitespace(input.description),
    ].join("\n");

    return {
      sourceId: null,
      identitySourceType: "CONTENT_SIGNATURE",
      identitySourceValue: signature,
      identityHash: this.hash(`CONTENT_SIGNATURE:${signature}`),
    };
  }

  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
}
