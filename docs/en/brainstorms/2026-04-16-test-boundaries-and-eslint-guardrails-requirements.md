---
date: 2026-04-16
topic: test-boundaries-and-eslint-guardrails
---

# Test Boundaries and ESLint Guardrails

## Problem Frame

The repository currently mixes two testing organization patterns inside the application packages: module-local unit tests colocated with feature code in `apps/api/src/**`, and application-level end-to-end tests grouped under `apps/api/test`. The split itself is healthy, but the `test` directory name implies that it contains all tests for the API app, which no longer matches reality and can mislead contributors about where new tests belong.

At the same time, the repo wants lightweight architectural guardrails that keep `apps/api` and `apps/web` maintainable without turning lint into a fight against the framework. The goal is not to enforce arbitrary style purity. The goal is to make package-local test boundaries clearer and add permissive ESLint size/complexity checks that catch obvious file and function sprawl early.

## Requirements

**Test boundary semantics**

- R1. Application-level end-to-end tests in `apps/api` must live under a directory whose name clearly communicates e2e intent rather than implying ownership of all test types.
- R2. Module-local unit and narrow integration tests in `apps/api/src/**` should remain colocated with the feature code they validate.
- R3. The repository should preserve a clear split between package-internal module tests and app-assembly or HTTP/database-backed e2e tests.
- R4. Test helper code that exists only to support app-level e2e coverage should live alongside the e2e suite rather than being moved into shared runtime packages prematurely.

**Lint guardrails**

- R5. The repo should add permissive ESLint maintainability guardrails for oversized files, oversized functions, or obviously over-complex control flow in `apps/api` and `apps/web`.
- R6. The guardrails must not use one shared threshold for all application code. Frontend and backend limits should be tuned separately because React/Next component files naturally differ from Nest service and controller files.
- R7. The frontend limits should distinguish at least between logic-heavy TypeScript files and JSX/TSX component files, with additional flexibility for framework entry files such as page or layout surfaces when needed.
- R8. Test files should not be held to the same size limits as production source files; they need either wider thresholds or targeted exemptions.
- R9. The first rollout should favor a small number of low-ambiguity ESLint rules over an aggressive rule set that creates busywork or forces artificial function splitting.

**Execution model**

- R10. The new maintainability guardrails should run through the existing ESLint entry points rather than introducing a separate custom checker.
- R11. CI should continue to treat ESLint as a required quality gate for these rules rather than creating a parallel enforcement path.

## Success Criteria

- Contributors can tell at a glance that `apps/api/e2e` contains API app-level e2e coverage rather than all API tests.
- The repo keeps colocated module tests in `apps/api/src/**` while making the app-level e2e layer easier to discover and harder to misuse.
- `pnpm lint` surfaces obviously oversized or overly complex files/functions in `apps/api` and `apps/web` without producing widespread low-value churn.
- Frontend and backend contributors both see rules that feel directionally fair for their file types rather than one lowest-common-denominator threshold.

## Scope Boundaries

- This decision covers naming and placement semantics for app-level e2e coverage plus first-pass ESLint maintainability guardrails.
- This decision does not redesign the monorepo package graph or move app-specific tests into `packages/`.
- This decision does not attempt to encode the entire architecture as ESLint rules in the first pass.
- This decision does not require exact numeric thresholds to be fixed during brainstorming as long as planning receives the required direction on relative strictness and exemptions.

## Key Decisions

- Rename the misleading `apps/api/test` surface to `apps/api/e2e` so the directory communicates scope instead of over-claiming ownership of all tests.
- Keep module-local tests colocated in feature folders. The problem is directory semantics for app-level tests, not the existence of two testing layers.
- Treat line-count and complexity limits as maintainability guardrails, not as the primary definition of architecture boundaries.
- Enforce the first pass through the existing ESLint and CI flow because the repo already treats lint as a required gate.
- Split rule thresholds by app context and file role instead of pretending React components and Nest providers should fit the same limits.

## Dependencies / Assumptions

- `apps/api/src/**` already contains colocated `*.spec.ts` unit tests for feature-local behavior.
- `apps/api/test/*.e2e-spec.ts` and `apps/api/test/test-db.ts` show that API app-level e2e coverage and e2e-only helpers already exist as a separate layer today.
- `apps/web/eslint.config.mjs`, `apps/api/eslint.config.mjs`, and `packages/eslint-config/*` already provide shared ESLint ownership that can carry the new guardrails.
- `package.json`, `apps/api/package.json`, and `apps/web/package.json` already expose lint commands that CI uses as required quality gates.

## Alternatives Considered

- **Keep `apps/api/test` and rely on documentation only:** lowest change cost, but the misleading directory name keeps teaching the wrong mental model.
- **Move all tests into one top-level app test tree:** superficially uniform, but it weakens feature-local ownership and makes module tests less discoverable next to the code they validate.
- **Recommended direction — keep split layers but rename the app-level e2e surface and add light lint guardrails:** clarifies intent without collapsing useful boundaries or over-engineering the first pass.

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Technical] Which exact ESLint rules and numeric thresholds should be used for `apps/api`, `apps/web/**/*.ts`, `apps/web/**/*.tsx`, and test files.
- [Affects R7][Technical] Which Next.js entry files in `apps/web/app/**` need targeted exceptions or wider thresholds in the first rollout.
- [Affects R10][Technical] Whether the threshold split should live entirely in `packages/eslint-config`, partially in app-local ESLint configs, or both.
- [Affects R11][Technical] Whether the rollout should be one-step strict enforcement or a staged cleanup sequence if the initial thresholds hit too many existing files.

## Next Steps

-> /ce:plan for structured implementation planning
