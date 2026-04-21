---
date: 2026-04-21
topic: docker-images-and-vps-compose
---

# Docker Images and VPS Compose Requirements

## Problem Frame

The repository now has deployable `apps/web` and `apps/api` applications, but no
container assets or single-host deployment path. The next step is to package
both apps into production-oriented Docker images and provide a straightforward
VPS deployment flow that matches the current product shape: one host,
single-process API assumptions, bundled PostgreSQL, and a reverse proxy entry
point.

This work matters because the project needs a repeatable operator path from repo
checkout to a running self-hosted stack without first introducing image
registries, multi-node orchestration, or platform-specific deployment logic.

## Requirements

**Packaging**

- R1. The repository must define a production-oriented Docker image for
  `apps/web`.
- R2. The repository must define a production-oriented Docker image for
  `apps/api`.
- R3. The image strategy must preserve the Turborepo monorepo structure instead
  of collapsing app-specific or shared-package responsibilities into the repo
  root.

**Deployment Topology**

- R4. The repository must provide a single-host deployment path based on Docker
  Compose that runs `web`, `api`, `postgres`, and a reverse proxy together.
- R5. The default Compose topology must keep PostgreSQL internal to the Compose
  network and avoid exposing a host port for the database.
- R5a. The default PostgreSQL service must not define a host `ports` publish.
  If a temporary host-visible mapping is ever added for local debugging, it
  must bind to `127.0.0.1` only, never `0.0.0.0`.
- R6. The default Compose topology must support the current API runtime
  assumption that wake-driven auto-refresh is single-process only, not a
  multi-replica deployment.
- R7. External traffic must enter through a reverse proxy layer rather than by
  exposing raw application ports as the primary public interface.
- R8. The reverse proxy choice for the first delivery must be Caddy.

**Operator Workflow**

- R9. A VPS operator must be able to build and run the stack on the server
  directly from the repository without requiring a preconfigured container
  registry or CI image publishing flow.
- R10. The deployment flow must stay compatible with app-owned runtime inputs
  already documented in `apps/api/README.md` and the existing app startup
  commands declared in `apps/web/package.json` and `apps/api/package.json`.
- R11. The delivered deployment path must be understandable for a single-host
  self-hosting workflow, including how operators provide environment variables,
  persistent data, and the subscription input owned by `apps/api`.
- R12. The deployment path must treat `apps/api/feeds.opml` as operator-owned
  input. The API container must consume it from an explicit host path bind
  mount chosen by the operator rather than baking feed subscriptions into an
  image, named volume bootstrap, or repo-managed default deployment payload.

## Success Criteria

- An operator can clone the repo on a VPS and bring up a complete stack for
  `web`, `api`, PostgreSQL, and Caddy with a documented Compose-based flow.
- The default deployment does not publish PostgreSQL to the host network.
- The deployment path does not assume API horizontal scaling.
- The first deployment path avoids registry publishing complexity and is focused
  on local image builds on the target host.
- The operator can point the API service at a manually chosen host path for the
  feed subscription file.

## Scope Boundaries

- No GitHub Actions or registry publishing flow in this slice.
- No Kubernetes, ECS, Nomad, or multi-host orchestration in this slice.
- No attempt to make the API safe for multi-replica ingestion or distributed
  wake-refresh coordination in this slice.
- No requirement to support multiple reverse proxies in the first delivery.
- No requirement to expose PostgreSQL to the host by default.
- No support requirement for publicly binding PostgreSQL on `0.0.0.0`.

## Key Decisions

- Two separate app images plus one Compose stack: keeps deployable ownership
  aligned with `apps/web` and `apps/api` while still giving operators a
  one-command single-host flow.
- Compose-managed PostgreSQL: matches the intended first self-hosting path and
  avoids dependence on a pre-existing host database service.
- Internal-only PostgreSQL port: prevents conflict with any host-level database
  service and reduces accidental exposure.
- If host-visible PostgreSQL access is ever temporarily needed for debugging,
  loopback-only `127.0.0.1` binding is the safe exception; public `0.0.0.0`
  exposure is out of scope for the first delivery.
- Caddy as the first reverse proxy: minimizes first-deployment operational
  friction on a VPS.
- Server-local image builds only: keeps the first milestone focused on a working
  deployment path before adding registry and CI/CD complexity.

## Alternatives Considered

- Build only `apps/api` first: simpler, but leaves the full product without a
  unified deployment path.
- Ship images without Compose: reduces immediate scope, but pushes too much
  assembly work onto the operator for the first VPS deployment.
- Add CI-published images now: useful later, but extra complexity for a first
  self-hosted milestone.
- Use Nginx first: viable, but less operationally convenient than Caddy for the
  chosen single-host path.

## Dependencies / Assumptions

- `apps/web` remains a separately deployable Next.js app.
- `apps/api` remains a separately deployable NestJS app backed by PostgreSQL.
- PostgreSQL persistence, application environment variables, and the feed
  subscription input need explicit operator-owned storage or mount decisions in
  planning.
- The feed subscription file is user-managed content, not a static deployment
  asset owned by the image.
- The current single-process API behavior documented in `apps/api/README.md`
  remains an accepted deployment constraint for this milestone.

## Outstanding Questions

### Resolve Before Planning

None.

### Deferred to Planning

- [Affects R4,R7,R9][Technical] What is the exact public routing contract
  between Caddy, `web`, and `api`, especially if browser-visible API traffic
  needs same-origin proxying?
- [Affects R9,R11,R12][Technical] Which runtime inputs should come from Compose
  environment files versus mounted files or named volumes, given that the feed
  subscription file must come from an operator-chosen host path bind mount?
- [Affects R10,R11][Technical] What is the smallest reliable startup sequence
  for migrations, app boot, and dependency readiness on a single host?

## Next Steps

-> /ce:plan for structured implementation planning
