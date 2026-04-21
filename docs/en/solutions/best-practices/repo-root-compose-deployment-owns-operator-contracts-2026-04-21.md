---
title: Keep self-hosted Docker Compose deployment operator-owned at the repo root
date: 2026-04-21
category: best-practices
module: vps deployment
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - adding a self-hosted Docker Compose deployment path to this monorepo
  - deciding whether deployment files belong at the repo root or inside an app
  - wiring health checks and startup ordering across web, api, and postgres
  - clarifying which runtime inputs are operator-owned versus app-local
  - narrowing a first deployment path to HTTP-only reverse proxying
tags:
  [
    docker,
    compose,
    caddy,
    deployment,
    vps,
    health-checks,
    monorepo,
    operator-contract,
  ]
---

# Keep self-hosted Docker Compose deployment operator-owned at the repo root

## Context

This repository added a VPS/self-hosted Docker Compose path that needed to respect two boundaries at the same time: Turborepo app ownership and operator-facing deployment ergonomics.

The risky failure mode was to blur those boundaries. If deployment logic moved into one app, operators would need to discover app-specific entrypoints for a cross-app stack. If app-local development env files were reused as the production contract, the deployment path would silently inherit assumptions that only make sense on a developer machine. A follow-up correction in the same work made that drift visible again: the first Caddy contract had implied hostname/TLS flexibility, but the actual requirement was a simpler HTTP-only reverse proxy.

## Guidance

Treat the repo root as the single operator entrypoint for self-hosted deployment, and keep app-specific build logic inside the owning apps.

For this repo, that means:

- repo root owns `compose.yaml`, root `.env`, `.env.example`, and `Caddyfile`
- `apps/api` and `apps/web` keep their own Dockerfiles and package-local runtime details
- `compose.yaml` builds app images from repo-root context but points at app-local Dockerfiles
- only `caddy` publishes a host port; `postgres`, `api-migrate`, `api`, and `web` stay on the Compose network
- startup ordering is health-gated: `postgres` -> `api-migrate` -> `api` -> `web` -> `caddy`
- health surfaces are explicit and dependency-light: `api` exposes `/health/live` and `/health/ready`, `web` exposes `/api/health`
- the first deployment contract stays intentionally narrow: Caddy listens on `:80` and proxies to `web:3001` without domain or TLS configuration

Keep operator-owned inputs separate from app-local development defaults. The root `.env.example` should describe only values that an operator truly owns at deployment time, such as `HTTP_PORT`, `POSTGRES_*`, `FEED_OPML_HOST_PATH`, `INGEST_ON_BOOT`, and `LLM_*`. App-local files like `apps/api/.env.local` and `apps/web/.env.local` remain development concerns and should not become the production contract.

Lock the topology with a root contract test. In this change, `.github/scripts/compose-contract.test.mjs` verifies service topology, app-local Dockerfile ownership, host-port exposure, health-gated dependencies, exact image pinning, and the deliberate absence of `HTTPS_PORT` / `CADDY_SITE_ADDRESS` in the first deployment mode.

## Why This Matters

This pattern avoids two classes of drift.

First, it preserves monorepo boundaries. The web and API packages still own how their images are built, while the repo root owns only the cross-app orchestration that genuinely spans the stack. That keeps deployment implementation from collapsing package responsibilities into the root.

Second, it keeps the deployment contract truthful. The HTTP-only follow-up mattered because domain/TLS placeholders made the first rollout look more flexible than it really was. When deployment docs, env files, and contract tests all say the same narrower thing, operators get one stable mental model instead of several partially overlapping ones.

The explicit health chain also prevents premature startup. Caddy should not route to a web container that cannot reach the API yet, and the API should not advertise readiness before migrations complete and the database responds. Dedicated probe routes make that state visible without depending on business pages.

## When to Apply

- When adding a repo-wide deployment path for multiple apps in this monorepo
- When deciding whether root config should describe operator inputs or developer inputs
- When introducing reverse proxy and health checks for container orchestration
- When a first deployment mode should stay intentionally narrower than future hosting ambitions
- When documenting or testing deployment invariants that must not drift

## Examples

Repo-root orchestration, app-local image ownership:

```yaml
services:
  api:
    build:
      context: .
      dockerfile: ./apps/api/Dockerfile
  web:
    build:
      context: .
      dockerfile: ./apps/web/Dockerfile
  caddy:
    ports:
      - "${HTTP_PORT:-80}:80"
```

Explicit health-gated startup chain:

```yaml
api:
  depends_on:
    postgres:
      condition: service_healthy
    api-migrate:
      condition: service_completed_successfully
web:
  depends_on:
    api:
      condition: service_healthy
caddy:
  depends_on:
    web:
      condition: service_healthy
```

Dedicated probe surfaces instead of probing business routes:

```ts
// apps/api/src/health/health.controller.ts
@Get("ready")
async ready(@Res({ passthrough: true }) response: Response) {
  await this.prisma.$queryRawUnsafe("SELECT 1");
  return { service: "api", status: "ok" };
}
```

```ts
// apps/web/app/api/health/route.ts
export function GET() {
  return NextResponse.json({ service: "web", status: "ok" });
}
```

Narrow first deployment contract for Caddy:

```caddyfile
:80 {
  encode gzip zstd
  reverse_proxy web:3001
}
```

And the contract test locks that scope:

```js
assert.doesNotMatch(caddyBlock, /HTTPS_PORT|CADDY_SITE_ADDRESS/);
```

## Related

- `compose.yaml`
- `Caddyfile`
- `.env.example`
- `.github/scripts/compose-contract.test.mjs`
- `apps/api/src/health/health.controller.ts`
- `apps/web/app/api/health/route.ts`
- `README.md`
- `README.zh-Hans.md`
- `docs/en/plans/2026-04-21-001-feat-docker-images-vps-compose-plan.md`
- `docs/zh-Hans/plans/2026-04-21-001-feat-docker-images-vps-compose-plan.md`
- `docs/en/solutions/integration-issues/ci-e2e-runtime-inputs-must-match-seeded-targets-2026-04-16.md`
