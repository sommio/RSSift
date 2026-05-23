---
title: "fix: Use root package.json as single OpenAPI version source"
type: fix
status: completed
date: 2026-05-23
---

# fix: Use root package.json as single OpenAPI version source

## Overview

CI `openapi-contract.e2e-spec.ts` fails because commit `6e0dffc` removed `.setVersion("0.1.0")` from `openapi-document.ts`, causing Swagger to default to `1.0.0`, while the checked-in `openapi.yaml` still has `0.1.0`. Fix: read version from root `package.json` so there is a single source of truth.

## Problem Frame

- Runtime `createOpenApiDocument()` emits `info.version: "1.0.0"` (Swagger default)
- Checked-in `openapi.yaml` has `info.version: "0.1.0"`
- E2e deep-equal comparison fails
- User wants single version source: root `package.json`

## Requirements Trace

- R1. E2e contract test passes
- R2. Version defined in exactly one place (root `package.json`)
- R3. `contract:refresh` regenerates `openapi.yaml` with correct version

## Scope Boundaries

- No changes to e2e test logic
- No changes to contract refresh workflow beyond version source

## Context & Research

### Relevant Code and Patterns

- `apps/api/src/openapi/openapi-document.ts` — builds OpenAPI doc, missing `.setVersion()`
- `apps/api/src/openapi/openapi-refresh.ts` — regenerates `openapi.yaml` from `createOpenApiDocument()`
- `packages/api-contract/openapi/openapi.yaml` — checked-in contract, `version: 0.1.0`
- `package.json` (root) — `version: "0.1.0"`

## Key Technical Decisions

- **Read version from root `package.json` at runtime:** NestJS `DocumentBuilder.setVersion()` accepts a string. Read `package.json` from project root using `node:path` relative traversal. No extra dependencies needed.

## Implementation Units

- [x] **Unit 1: Set version from package.json in openapi-document.ts**

**Goal:** `createOpenApiDocument()` reads root `package.json` version and calls `.setVersion()`

**Requirements:** R1, R2

**Dependencies:** None

**Files:**

- Modify: `apps/api/src/openapi/openapi-document.ts`

**Approach:**

- Import `readFileSync` from `node:fs` and `resolve` from `node:path`
- Read `../../../../package.json` relative to `__dirname`
- Parse JSON, extract `.version`
- Chain `.setVersion(version)` on DocumentBuilder before `.build()`

**Test scenarios:**

- Happy path: emitted document `info.version` equals root `package.json` version
- Integration: e2e test `openapi-contract.e2e-spec.ts` passes (emitted equals checked-in)

**Verification:**

- `pnpm test:e2e` in `apps/api` passes

- [x] **Unit 2: Regenerate openapi.yaml**

**Goal:** Checked-in contract reflects the new version source

**Requirements:** R3

**Dependencies:** Unit 1

**Files:**

- Regenerate: `packages/api-contract/openapi/openapi.yaml`

**Approach:**

- Run `pnpm contract:refresh` from repo root
- Commit updated `openapi.yaml`

**Test scenarios:**

- Happy path: `openapi.yaml` `info.version` matches root `package.json` version

**Verification:**

- `openapi.yaml` `info.version` is `0.1.0` (matching root `package.json`)

## Risks & Dependencies

| Risk                                                                               | Mitigation                                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Root `package.json` path resolution breaks in different contexts (test vs runtime) | Use `__dirname` relative traversal, same pattern as `openapi-refresh.ts` already uses for contract path |
