---
title: Prisma entry schema must not host article identity enums
date: 2026-04-27
category: integration-issues
module: prisma schema organization
problem_type: integration_issue
component: prisma_schema
symptoms:
  - `apps/api/prisma/schema.prisma` defined `IdentitySourceType`, but that enum is only used by `Article`
  - the entry schema mixed generator / datasource setup with a domain-owned type, so the root file stopped being a thin bootstrap layer
  - any future change to article identity semantics would require editing the entry schema even though the ownership belongs to the article model file
root_cause: boundary_leak
resolution_type: code_fix
severity: medium
related_components:
  - database
  - schema_directory
tags:
  [
    prisma,
    schema-organization,
    models-directory,
    enum,
    architecture-boundary,
    article-identity,
  ]
---

# Prisma entry schema must not host article identity enums

## Problem

`apps/api/prisma/schema.prisma` is acting like a root entry file, but it currently contains `enum IdentitySourceType { SOURCE_ID CANONICAL_URL CONTENT_SIGNATURE }`. That enum is only consumed by `Article` in `apps/api/prisma/models/article.prisma`, so the root schema is holding domain-owned state that belongs with the article model.

That placement breaks the intended boundary in two ways:

- the root schema stops being a thin bootstrap layer for generator / datasource setup
- article identity semantics become split across the entry file and the model file that actually uses them

## Symptoms

- The enum lives in the entry schema instead of next to the `Article` model that references it.
- The root file becomes a dumping ground for one-off domain types instead of staying focused on schema bootstrap.
- Reviewers have to inspect the entry schema to understand article identity, even though the article model file is the real ownership boundary.

## What Didn't Work

- Keeping the enum in `schema.prisma` because it is "globally visible" to Prisma only hides the ownership problem; visibility is not the same as responsibility.
- Treating the root schema as a convenient place for small domain types encourages more drift over time, especially once other models start copying the same pattern.
- Leaving the enum separate from the model that uses it makes the article schema harder to read and harder to maintain as the identity rules evolve.

## Solution

Move `IdentitySourceType` into `apps/api/prisma/models/article.prisma` alongside `Article`, and keep `apps/api/prisma/schema.prisma` limited to shared entry concerns such as generator and datasource wiring.

The ownership rule is simple:

- if only one model uses the type, define it in that model file
- if a type becomes truly shared, place it in a deliberately shared file under `apps/api/prisma/models/`, not in the root entry schema

That keeps article identity rules close to the `Article` model and preserves the root schema as a thin bootstrap surface.

## Why This Works

The repository already treats `apps/api/prisma/models/` as the place for domain split files. The article model already owns `identityHash`, `identitySourceType`, `identitySourceValue`, and `sourceId`, so the enum belongs in the same ownership boundary.

This layout also scales better:

- model-local enums stay easy to discover
- the entry schema stays stable
- future article identity changes do not leak through unrelated schema bootstrap code

## Prevention

- Keep `schema.prisma` thin: generator, datasource, and other shared bootstrap concerns only.
- Place enums beside the model that owns their semantics unless they are genuinely shared.
- Review `apps/api/prisma/models/` first when checking schema ownership; do not use the root schema as the default home for domain types.
- If a type starts in one model and later spreads, extract it intentionally after the shared use case is real.

## Related Issues

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/models/article.prisma`
- `apps/api/prisma/migrations/202604150001_init_feed_ingestion/migration.sql`
- `docs/en/plans/2026-04-15-001-feat-feed-ingestion-backbone-plan.md`
- `docs/zh-Hans/plans/2026-04-15-001-feat-feed-ingestion-backbone-plan.md`
