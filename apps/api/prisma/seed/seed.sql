BEGIN;

DELETE FROM "Article";
DELETE FROM "Feed";

INSERT INTO "Feed" ("id", "feedUrl", "siteTitle", "createdAt", "updatedAt")
VALUES
  ('feed-001', 'https://example.com/systems-weekly.xml', 'Systems Weekly', NOW(), NOW()),
  ('feed-002', 'https://example.com/product-craft.xml', 'Product Craft Daily', NOW(), NOW()),
  ('feed-003', 'https://example.com/platform-notes.xml', 'Platform Engineering Notes', NOW(), NOW());

INSERT INTO "Article"
  (
    "id",
    "feedId",
    "identityHash",
    "identitySourceType",
    "identitySourceValue",
    "contentExtractedAt",
    "contentMarkdown",
    "ingestedAt",
    "originalUrl",
    "publishedAt",
    "sourceId",
    "summary",
    "title",
    "translatedTitle",
    "createdAt",
    "updatedAt"
  )
VALUES
  (
    'article-001',
    'feed-001',
    'seed-hash-001',
    'SOURCE_ID',
    'seed-guid-001',
    TIMESTAMP '2026-04-15 00:03:00',
    '# Rust 1.80 Stabilizes Safer Async Building Blocks',
    TIMESTAMP '2026-04-15 00:00:00',
    'https://example.com/systems-weekly/rust-1-80-async',
    TIMESTAMP '2026-03-30 09:00:00',
    'seed-guid-001',
    '## Title

Rust 1.80 带来更安全的异步基础能力

## Summary

Rust 1.80 扩展了异步人体工学、trait 改进和额外的安全检查，帮助生产服务更稳地采用 async。

## Key Points

1. 新增的异步 trait 改进减少了样板代码。
2. 更多安全检查帮助服务在高并发场景下降低踩坑概率。
3. 团队可以更容易把实验性的 async 模式推进到生产。 ',
    'Rust 1.80 Stabilizes Safer Async Building Blocks',
    'Rust 1.80 带来更安全的异步基础能力',
    NOW(),
    NOW()
  ),
  (
    'article-002',
    'feed-002',
    'seed-hash-002',
    'SOURCE_ID',
    'seed-guid-002',
    TIMESTAMP '2026-04-15 00:06:00',
    '# Designing Reader-First Interfaces for Knowledge Work',
    TIMESTAMP '2026-04-15 00:00:00',
    'https://example.com/product-craft/reader-first-interfaces',
    TIMESTAMP '2026-04-02 13:45:00',
    'seed-guid-002',
    '',
    'Designing Reader-First Interfaces for Knowledge Work',
    '',
    NOW(),
    NOW()
  ),
  (
    'article-003',
    'feed-003',
    'seed-hash-003',
    'SOURCE_ID',
    'seed-guid-003',
    NULL,
    NULL,
    TIMESTAMP '2026-04-15 00:00:00',
    'https://example.com/platform-notes/turborepo-boundaries',
    TIMESTAMP '2026-04-05 07:20:00',
    'seed-guid-003',
    '',
    'Pragmatic Monorepo Boundaries with Turborepo',
    '',
    NOW(),
    NOW()
  );

COMMIT;
