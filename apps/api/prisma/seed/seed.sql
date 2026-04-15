BEGIN;

DELETE FROM "Article";
DELETE FROM "Feed";

INSERT INTO "Feed" ("id", "feedUrl", "siteTitle", "createdAt", "updatedAt")
VALUES
  ('feed-001', 'https://example.com/systems-weekly.xml', 'Systems Weekly', NOW(), NOW()),
  ('feed-002', 'https://example.com/product-craft.xml', 'Product Craft Daily', NOW(), NOW()),
  ('feed-003', 'https://example.com/platform-notes.xml', 'Platform Engineering Notes', NOW(), NOW());

INSERT INTO "Article"
  ("id", "feedId", "identityHash", "identitySourceType", "identitySourceValue", "ingestedAt", "originalUrl", "publishedAt", "sourceId", "summary", "title", "createdAt", "updatedAt")
VALUES
  (
    'article-001',
    'feed-001',
    'seed-hash-001',
    'SOURCE_ID',
    'seed-guid-001',
    TIMESTAMP '2026-04-15 00:00:00',
    'https://example.com/systems-weekly/rust-1-80-async',
    TIMESTAMP '2026-03-30 09:00:00',
    'seed-guid-001',
    'Rust 1.80 expands async ergonomics with additional safety checks and trait improvements for production services.',
    'Rust 1.80 Stabilizes Safer Async Building Blocks',
    NOW(),
    NOW()
  ),
  (
    'article-002',
    'feed-002',
    'seed-hash-002',
    'SOURCE_ID',
    'seed-guid-002',
    TIMESTAMP '2026-04-15 00:00:00',
    'https://example.com/product-craft/reader-first-interfaces',
    TIMESTAMP '2026-04-02 13:45:00',
    'seed-guid-002',
    'Reader-first layouts reduce cognitive load by emphasizing scanability, hierarchy, and predictable navigation states.',
    'Designing Reader-First Interfaces for Knowledge Work',
    NOW(),
    NOW()
  ),
  (
    'article-003',
    'feed-003',
    'seed-hash-003',
    'SOURCE_ID',
    'seed-guid-003',
    TIMESTAMP '2026-04-15 00:00:00',
    'https://example.com/platform-notes/turborepo-boundaries',
    TIMESTAMP '2026-04-05 07:20:00',
    'seed-guid-003',
    'A practical guide to package boundaries, shared tooling ownership, and avoiding accidental cross-workspace coupling.',
    'Pragmatic Monorepo Boundaries with Turborepo',
    NOW(),
    NOW()
  );

COMMIT;
