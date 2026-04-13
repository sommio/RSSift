---
title: feat: Implement the first vertical slice read path
type: feat
status: completed
date: 2026-04-10
deepened: 2026-04-10
origin:
  - docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md
  - docs/en/api-designs/v0.1-first-vertical-slice-api.md
  - docs/zh-Hans/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md
  - docs/en/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md
---

# feat: Implement the first vertical slice read path

## Overview

This plan turns the frozen first-slice API contract into a runnable vertical slice across `apps/api` and `apps/web`. The slice remains fixture-backed: the API serves prepared article items from local data, the web app consumes the real HTTP contract, and the frontend stack for this slice is explicitly Tailwind CSS plus shadcn/ui across the `apps/web` / `packages/ui` monorepo boundary with explicit config and lint/format guardrails to constrain later agent behavior.

## Problem Frame

The contract work is already complete in `docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md` and `docs/en/api-designs/v0.1-first-vertical-slice-api.md`. What is still missing is a runnable proof that the repository can serve and render that contract end-to-end.

The current codebase still consists mostly of scaffolding: `apps/api` exposes only the health endpoint, and `apps/web` still renders the template landing page. This planning pass therefore focuses on how to land the first real read path without accidentally expanding into ingestion, persistence, or a broader product surface.

Additional user constraints carried into this plan:

- `apps/web` must use Tailwind CSS and shadcn/ui rather than plain custom CSS for the reader shell.
- `apps/web` must include an explicit `tailwind.config.js` as a reviewable Tailwind guardrail and load it from the CSS entrypoint so agents do not drift on theme extensions, plugin wiring, or source registration.
- Tailwind class authoring should also be constrained by `eslint-plugin-better-tailwindcss` and `prettier-plugin-tailwindcss`; this plan switches to the former because `eslint-plugin-tailwindcss` still lacks stable Tailwind CSS v4 support.
- Non-trivial implementation work should respect the repo's delegation-first execution posture from `AGENTS.md`.
- Beyond delegation-first, execution should follow the `AGENTS.md` skill-level conventions and invoke the required skills for each scope so frontend and backend implementation do not drift.
- Any new package installation required for implementation must be surfaced to the user before `/ce:work` installs it.

## Requirements Trace

- R1. The public API must expose only `GET /articles` and `GET /articles/:id` (see origin: `docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md`).
- R2. The runnable slice must cover the minimum dual-pane read loop: left-pane article list and right-pane article detail.
- R3. The list response must expose exactly `id`, `title`, `sourceTitle`, `publishedAt`, and `originalUrl`.
- R4. The detail response must expose exactly `title`, `sourceTitle`, `publishedAt`, `summary`, and `originalUrl`.
- R5. The slice must not grow pagination, filters, auth, refresh/retry controls, summary-status fields, or translation behavior.
- R6. The implementation must keep the product meaning from the origin docs: the client consumes prepared reading items rather than controlling background workflows.
- R7. `apps/web` must implement its reader shell with Tailwind CSS and shadcn/ui primitives.
- R8. The first runnable slice must stay fixture-backed and model only prepared article items; it must not implement `config.opml` loading or real feed ingestion.
- R9. The work must preserve the monorepo architecture required by `AGENTS.md`: workspace layout, package boundaries, shared configuration, task graph behavior, and repo-level conventions must remain intact.
- R10. The implementation path must disclose any new package installation before execution starts.
- R11. The execution plan should assume delegation-first implementation for non-trivial units, followed by primary-agent verification.
- R12. Template-only scaffold behavior and files in `apps/api` and `apps/web` should be removed or replaced when the first slice makes them obsolete.
- R13. New registry packages must be installed with `pnpm` using the then-current latest stable versions in the package that uses them; if dependency resolution turns into peer-conflict churn, overrides, or other dependency hell, stop and ask the user before forcing a workaround.
- R14. `apps/web` must check in an explicit `tailwind.config.js` and load it from the Tailwind CSS entrypoint so theme extensions, plugin boundaries, and monorepo source registration become reviewable guardrails instead of executor-time improvisation.
- R15. Tailwind class authoring must also be constrained by `eslint-plugin-better-tailwindcss` and `prettier-plugin-tailwindcss`; this plan explicitly does not use `eslint-plugin-tailwindcss` because it still lacks stable Tailwind CSS v4 support; both packages remain subject to R13's latest-stable-only and stop-for-dependency-hell rules.
- R16. Implementation must follow the `AGENTS.md` skill-level conventions: `apps/api` uses `nestjs-best-practices`; `apps/web` Next.js work uses `next-best-practices`; frontend architecture references `feature-sliced-design`; frontend page design invokes `frontend-design` → `ui-ux-pro-max` → `ckm-design-system` → `ckm-ui-styling` in that order to avoid agent drift.

## Scope Boundaries

- Do not implement real RSS ingestion, OPML parsing, schedulers, persistence, or summary generation workflows.
- Do not add auth, pagination, sorting controls, filters, read/save state, or feed-management UI.
- Introduce `packages/ui` only for reusable UI primitives and helpers that belong behind a package boundary; do not move app-specific reader composition, routing, or API access into that package.
- Do not introduce a new shared business-contract workspace package unless implementation uncovers a concrete second consumer or a parity problem that cannot be handled within the slice.
- Do not change the frozen API design docs unless product semantics actually change.
- Do not delete shared build/test/tooling infrastructure that still serves the repo; only remove scaffold artifacts that are superseded by the vertical slice.
- Do not hide Tailwind constraints in executor habits or undocumented conventions; the style guardrails should live explicitly in `apps/web/tailwind.config.js`, `apps/web/app/globals.css`, `packages/eslint-config`, and the root Prettier config.

## Context & Research

### Relevant Code and Patterns

- `apps/api/src/health.controller.ts`, `apps/api/src/health.service.ts`, and `apps/api/src/app.module.ts` show the current NestJS controller/service/module wiring pattern.
- `apps/api/src/health.controller.spec.ts` and `apps/api/test/app.e2e-spec.ts` show the current split between controller-level tests and HTTP e2e coverage.
- `apps/api/src/main.ts` already enables CORS, which keeps browser-based API consumption available if implementation needs it, but does not force a client-fetch architecture.
- `apps/web/app/page.tsx`, `apps/web/app/layout.tsx`, and `apps/web/app/page.spec.tsx` show the current Next.js App Router and page-test baseline.
- `apps/web/e2e/home.spec.ts` and `apps/web/playwright.config.ts` show the existing browser-test entry point, but they currently exercise only the template page.
- `apps/web/package.json` contains no Tailwind CSS, shadcn/ui, Radix UI, or related utility dependencies today; this is a net-new frontend stack introduction.
- `packages/eslint-config/base.js`, `packages/eslint-config/next.js`, `apps/web/eslint.config.mjs`, and the root `package.json` show the current shared lint/tooling ownership, which is the right boundary for Tailwind static guardrails instead of pushing more repo-level rules into the app.
- The root `package.json` already owns repo-level Prettier scripts, but there is no checked-in `.prettierrc.mjs` yet; adding Tailwind class sorting should therefore land as a root Prettier config rather than app-by-app drift.
- The current app-level template leftovers are still visible in `apps/api/src/health.controller.ts`, `apps/api/src/health.service.ts`, `apps/api/test/app.e2e-spec.ts`, `apps/web/app/page.tsx`, `apps/web/app/layout.tsx`, `apps/web/e2e/home.spec.ts`, and the two app READMEs; the slice should replace or remove these where they no longer represent shipped behavior.

### Institutional Learnings

- `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md` and `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md` establish that paired Chinese/English docs and plans must be updated together whenever scope or semantics move.
- The same learning also warns against path drift. Any new implementation plan should point at the current API design docs and previous API plan explicitly rather than assuming readers will infer the lineage.

### External References

- Tailwind CSS official Next.js installation guide: `https://tailwindcss.com/docs/installation/framework-guides/nextjs`
- Tailwind CSS official functions/directives docs: `https://tailwindcss.com/docs/functions-and-directives`
- Tailwind CSS official source-detection docs: `https://tailwindcss.com/docs/detecting-classes-in-source-files`
- shadcn/ui manual installation guide: `https://ui.shadcn.com/docs/installation/manual`
- shadcn/ui monorepo guide: `https://ui.shadcn.com/docs/monorepo`
- `prettier-plugin-tailwindcss` official repository: `https://github.com/tailwindlabs/prettier-plugin-tailwindcss`
- `eslint-plugin-better-tailwindcss` official repository: `https://github.com/schoero/eslint-plugin-better-tailwindcss`
- `eslint-plugin-tailwindcss` official repository (not selected because Tailwind CSS v4 support is still not stable): `https://github.com/francoismassart/eslint-plugin-tailwindcss`
- Turborepo monorepo best practices: `https://raw.githubusercontent.com/vercel/turborepo/refs/heads/main/skills/turborepo/references/best-practices/RULE.md`

## Key Technical Decisions

- Keep the first runnable data source as a prepared-items fixture inside `apps/api`. The API should read local deterministic article data and expose only the frozen list/detail contract, so later ingestion work can replace one adapter seam instead of rewriting the public surface.
- Implement the web reader with URL-driven server-side data loading first. `apps/web` should fetch the list and selected detail on the server using a base URL configuration and the `articleId` search parameter, which keeps the first slice simple and avoids inventing a client-side cache or mutation model.
- Introduce `packages/ui` now as a narrow library package for reusable shadcn/ui primitives and helper utilities. This better matches Turborepo best practices for shared code, keeps UI code out of `apps/web` once it becomes reusable, and lets the app stay focused on routing, data loading, and reader-specific composition.
- Treat `apps/web/tailwind.config.js` as an intentional guardrail. Even though Tailwind CSS v4 is CSS-first, this plan still keeps an explicit JavaScript config and loads it from `apps/web/app/globals.css` via `@config`; the same CSS entrypoint should register `packages/ui` through `@source` or an equivalent Tailwind v4-compatible source mechanism. That makes theme/token/plugin/source rules durable and reviewable instead of agent improvisation.
- Do not create a shared business-contract package in the first slice. The contract is intentionally tiny, there is no existing business-types package to follow, and parity can be held with explicit API tests plus a narrow web adapter. Revisit this only if a second consumer or repeated drift appears.
- Put Tailwind static constraints on top of the existing monorepo tooling ownership: `packages/eslint-config` should own `eslint-plugin-better-tailwindcss` and extend the shared Next.js preset, while the repo root should own `.prettierrc.mjs` plus `prettier-plugin-tailwindcss` and point Tailwind v4 formatting at `apps/web/app/globals.css` through `tailwindStylesheet`. The plan switches to `eslint-plugin-better-tailwindcss` because its latest stable peer range explicitly covers Tailwind CSS v4, while `eslint-plugin-tailwindcss` still lacks stable v4 support. If the chosen plugin still produces meaningful false positives or incompatibilities in this repo, execution must stop and ask the user before switching lint stacks or dropping the guardrail.
- Treat package disclosure as a staged planning-time commitment. Before `/ce:work` installs anything, surface the currently known package set to the user and group it by ownership boundary: repo root only for repository-level tooling such as `prettier-plugin-tailwindcss`; `packages/eslint-config` for lint-rule dependencies such as `eslint-plugin-better-tailwindcss`; `apps/web` for Tailwind/build tooling such as `tailwindcss`, `@tailwindcss/postcss`, and `postcss`; `packages/ui` for UI-library runtime/helper dependencies such as `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`, `@radix-ui/react-slot`, `@radix-ui/react-scroll-area`, and `@radix-ui/react-separator`; and `apps/web` should consume `@repo/ui` via a workspace dependency. Use `pnpm` to resolve the latest stable registry versions at execution time rather than hard-coding planning-time version numbers. Treat the shadcn generator as ephemeral tooling rather than a permanent root dependency. If implementation discovers extra component-specific dependencies, disclose that delta before installing them, and if installation requires overrides, forced peer-resolution, or other dependency-hell tactics, stop and ask the user first. No new API runtime package is planned.
- Carry the repo's delegation-first posture into execution. Non-trivial implementation units should be delegated when the platform supports it, with the primary executor remaining responsible for integration and verification.
- Carry the `AGENTS.md` skill-level conventions as hard guardrails during execution: `apps/api` code and structure follow `nestjs-best-practices`; `apps/web` Next.js boundaries follow `next-best-practices`; frontend architecture decisions reference `feature-sliced-design`; page design and styling work run through `frontend-design` → `ui-ux-pro-max` → `ckm-design-system` → `ckm-ui-styling`, then loop back through `frontend-design` acceptance.
- Remove scaffold-only template artifacts as part of the slice instead of leaving them beside the real feature. The article read path should become the new default proof surface in both apps, so template landing-page copy, demo browser assertions, and API health-demo wiring that no longer serve the repo should be replaced or deleted in the same pass.

## Open Questions

### Resolved During Planning

- Should this slice connect to real ingestion now? No. It should stay fixture-backed and represent only prepared reading items.
- Should Tailwind CSS and shadcn/ui live inside `apps/web` or trigger a shared UI workspace now? Introduce `packages/ui` now for reusable primitives, while keeping reader-specific composition in `apps/web`.
- Should the web app begin with client-side stateful fetching or a URL-driven server-rendered read path? Start with URL-driven server-side fetching keyed by `articleId`.
- Which package additions must be disclosed before implementation? The app-level Tailwind/build packages, the `packages/ui` runtime/helper packages, and any extra component-specific additions discovered during execution.
- What install policy should execution follow? Use `pnpm` with the then-current latest stable registry versions in the package that uses them, and pause for user confirmation if dependency resolution requires overrides or other conflict workarounds.
- What is the default local connection contract for the runnable slice? Document `API_BASE_URL=http://127.0.0.1:3000` as the local example for `apps/web`, while `apps/web` itself continues to run on port 3001.
- Which template leftovers should the implementation actively remove? Remove or replace the template landing-page copy and metadata in `apps/web`, the template browser assertions in `apps/web/e2e/home.spec.ts`, the generic app READMEs, and the health-demo module/tests in `apps/api` if they are not needed by the slice.
- How should Tailwind rules be made explicit enough to constrain later agents? Check in `apps/web/tailwind.config.js`, load it from `apps/web/app/globals.css` via `@config`, and explicitly register the `packages/ui` source range for Tailwind.
- Where should Tailwind lint/format guardrails live? `packages/eslint-config` owns `eslint-plugin-better-tailwindcss`, the repo root owns `.prettierrc.mjs` plus `prettier-plugin-tailwindcss`, and `apps/web` keeps only the runtime Tailwind/PostCSS configuration it actually uses.
- How should skill invocation be enforced in the implementation plan? Treat the `AGENTS.md` skill rules as mandatory by scope: API units use `nestjs-best-practices`; Next.js/App Router units use `next-best-practices`; frontend architecture adds `feature-sliced-design`; page design and styling units execute through the four required frontend skills in order.

### Deferred to Implementation

- The exact empty-state and error-state copy shown in the reader shell.
- Whether a later slice should compile `@repo/ui` as an independently built library instead of keeping the first version on the simplest workspace-library path.
- The final fixture dataset size, as long as it stays small and deterministic enough for fast tests.

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce._

```mermaid
flowchart LR
    subgraph API[apps/api]
        Fixture[prepared article fixture JSON] --> Repo[fixture-backed article source]
        Repo --> Service[articles service]
        Service --> ListEndpoint[GET /articles]
        Service --> DetailEndpoint[GET /articles/:id]
    end

    subgraph UI[packages/ui]
        Button[@repo/ui/button]
        Card[@repo/ui/card]
        ScrollArea[@repo/ui/scroll-area]
        Separator[@repo/ui/separator]
    end

    subgraph Web[apps/web]
        Page[App Router page + articleId search param] --> Client[server-side article API helper]
        Client --> ListEndpoint
        Client --> DetailEndpoint
        Page --> Reader[reader-specific composition]
        Reader --> Button
        Reader --> Card
        Reader --> ScrollArea
        Reader --> Separator
    end
```

## Implementation Units

- [x] **Unit 1: Add the fixture-backed article read module in `apps/api`**

**Goal:** Expose the frozen list/detail contract from a local prepared-items data source without introducing ingestion or persistence.

**Requirements:** R1, R2, R3, R4, R5, R6, R8, R9, R11, R12, R16

**Dependencies:** None

**Files:**

- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/src/articles/articles.module.ts`
- Create: `apps/api/src/articles/articles.controller.ts`
- Create: `apps/api/src/articles/articles.service.ts`
- Create: `apps/api/src/articles/article-fixture.repository.ts`
- Create: `apps/api/src/articles/articles.types.ts`
- Create: `apps/api/src/articles/fixtures/prepared-articles.json`
- Create: `apps/api/src/articles/articles.controller.spec.ts`
- Create: `apps/api/test/articles.e2e-spec.ts`
- Delete: `apps/api/src/health.controller.ts`
- Delete: `apps/api/src/health.service.ts`
- Delete: `apps/api/src/health.controller.spec.ts`
- Delete: `apps/api/test/app.e2e-spec.ts`
- Modify: `apps/api/README.md`

**Approach:**

- Store only prepared article items in the fixture source so the temporary seam mirrors the public read contract rather than prematurely modeling ingestion inputs.
- Keep fixture access behind a repository/adapter boundary so later real data preparation can replace one dependency instead of changing controllers or routes.
- Make `GET /articles` omit `summary`, and make `GET /articles/:id` return the prepared summary. Unknown article IDs should return an HTTP 404 instead of introducing a custom contract field.
- Preserve deterministic fixture ordering for the first slice so tests stay stable without locking long-term product sorting semantics.
- Remove the template health-demo module in the same pass if it no longer contributes to the runnable slice, so `apps/api` stops exposing scaffold-only behavior beside the real article surface.
- Replace the API README's generic template instructions with slice-relevant local run notes instead of leaving dead template references behind.
- Keep the API feature-module placement aligned with `AGENTS.md` and `nestjs-best-practices`: a self-contained feature folder rather than repository-wide technical-layer directories.

**Execution note:** Execution target: external-delegate. Delegate the API module implementation when possible, then verify the returned routes and tests before accepting the result.

**Patterns to follow:**

- `apps/api/src/health.controller.ts`
- `apps/api/src/health.service.ts`
- `apps/api/src/health.controller.spec.ts`
- `apps/api/test/app.e2e-spec.ts`

**Test scenarios:**

- Happy path — `GET /articles` returns an array of items whose fields are exactly `id`, `title`, `sourceTitle`, `publishedAt`, and `originalUrl`, with no `summary` field present.
- Happy path — `GET /articles/:id` returns the selected article detail with `title`, `sourceTitle`, `publishedAt`, `summary`, and `originalUrl`.
- Edge case — fixture data with multiple prepared items preserves deterministic response order so list rendering remains stable across test runs.
- Error path — requesting an unknown `articleId` returns HTTP 404 instead of a partial success payload.
- Integration — the runnable API exposes the article routes without leaving the template health endpoint behind once that endpoint is no longer needed by the slice.

**Verification:**

- The API exposes the documented article read routes with contract-faithful payload shapes, the data-source seam remains isolated to the article module, and obsolete template API behavior has been removed.

- [x] **Unit 2: Create `packages/ui` and wire the web UI plus Tailwind guardrail baseline**

**Goal:** Create a narrow `packages/ui` workspace for reusable shadcn/ui primitives and wire `apps/web` to consume it while establishing the Tailwind runtime, lint, and format guardrails without breaking the monorepo architecture.

**Requirements:** R7, R9, R10, R11, R13, R14, R15, R16

**Dependencies:** None

**Files:**

- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/app/globals.css`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.js`
- Modify: `packages/eslint-config/package.json`
- Modify: `packages/eslint-config/next.js`
- Create: `.prettierrc.mjs`
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/components.json`
- Create: `packages/ui/src/lib/utils.ts`
- Create: `packages/ui/src/components/ui/button.tsx`
- Create: `packages/ui/src/components/ui/card.tsx`
- Create: `packages/ui/src/components/ui/scroll-area.tsx`
- Create: `packages/ui/src/components/ui/separator.tsx`

**Approach:**

- Before installation begins, surface the exact package list to the user, split by package owner: repo root only for the repository-level Prettier plugin, Tailwind/build tooling in `apps/web`, the Tailwind ESLint plugin in `packages/eslint-config`, UI runtime/helper dependencies in `packages/ui`, and `@repo/ui` as the internal workspace dependency consumed by `apps/web`. The Tailwind ESLint plugin is intentionally `eslint-plugin-better-tailwindcss`, because `eslint-plugin-tailwindcss` still lacks stable Tailwind CSS v4 support.
- Create `packages/ui` as a one-purpose library package for reusable shadcn/ui primitives and helpers. Keep clear package exports, avoid cross-package relative imports, and do not use a broad barrel export that defeats tree-shaking.
- Check in an explicit `apps/web/tailwind.config.js` as a reviewable guardrail and load it from `apps/web/app/globals.css` via `@config`; the same CSS entrypoint should register `packages/ui` through `@source` or an equivalent Tailwind v4 source mechanism so shared primitive classes are not missed.
- Add `eslint-plugin-better-tailwindcss` in `packages/eslint-config` instead of app-local config so `apps/web` continues to inherit Tailwind linting from the shared Next.js preset; add `prettier-plugin-tailwindcss` in the repo root with `.prettierrc.mjs`, using `tailwindStylesheet` to point at `apps/web/app/globals.css`. If `packages/ui` introduces helpers like `cn` or `cva`, include those function names in the Prettier Tailwind-sorting config as well.
- Resolve new registry dependencies with `pnpm` at the then-current latest stable versions. If peer conflicts, overrides, or version deadlocks appear, stop execution and ask the user before forcing a workaround.
- If the latest stable `eslint-plugin-better-tailwindcss` still produces material false positives, parsing failures, or unusable rules in the chosen Tailwind v4 monorepo setup, stop execution and ask the user before switching lint stacks or weakening the guardrail.

**Execution note:** Execution target: external-delegate. Before any install step, show the user the exact package list, keep installs on `pnpm`, and pause for confirmation if dependency resolution stops being straightforward. This unit should follow `next-best-practices`, `feature-sliced-design`, and the frontend guardrails from `AGENTS.md`.

**Patterns to follow:**

- `package.json`
- `apps/web/app/layout.tsx`
- `apps/web/app/globals.css`
- `packages/eslint-config/next.js`
- `apps/web/eslint.config.mjs`
- shadcn/ui monorepo guide
- Turborepo monorepo best practices

**Test scenarios:**

- Tooling — `apps/web/app/globals.css` explicitly loads `apps/web/tailwind.config.js` and registers `packages/ui` for Tailwind source detection.
- Tooling — `pnpm lint` applies Tailwind lint rules to `apps/web` through `packages/eslint-config` rather than app-local one-off config.
- Tooling — `pnpm format:check` sorts Tailwind classes in `className`, `cn()`, and `cva()` usage through the root `.prettierrc.mjs` plus `prettier-plugin-tailwindcss`.
- Error path — if the latest stable `eslint-plugin-better-tailwindcss` cannot operate cleanly in the chosen Tailwind v4 setup, implementation pauses for user confirmation instead of silently switching lint stacks or weakening the rule set.

**Verification:**

- `apps/web` consumes reusable UI primitives from `@repo/ui`, shared UI code no longer lives in the app package, `apps/web/tailwind.config.js` plus `packages/eslint-config` plus the root `.prettierrc.mjs` form an explicit style guardrail, and the new workspace package fits the repo architecture without root-level runtime dependency sprawl.

- [x] **Unit 3: Add the web API-loading boundary and URL-driven selection model**

**Goal:** Make `apps/web` consume the real article API contract through one explicit server-side boundary and a stable `articleId` URL model.

**Requirements:** R2, R3, R4, R6, R7, R8, R9, R11, R16

**Dependencies:** Unit 1, Unit 2

**Files:**

- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/page.spec.tsx`
- Create: `apps/web/lib/articles-api.ts`
- Create: `apps/web/.env.example`
- Test: `apps/web/e2e/home.spec.ts`

**Approach:**

- Read `API_BASE_URL` from the server environment and keep network access inside a single web-side helper rather than scattering fetch calls through presentation components.
- Treat `http://127.0.0.1:3000` as the documented local example for `API_BASE_URL`, and keep that value synchronized between `.env.example` and the web README notes added later in the slice.
- Fetch the article list first, derive the selected ID from `searchParams.articleId` or the first available article, and then fetch detail for the selected article.
- If the list is empty, render the empty reader shell and skip the detail request. If the selected detail is unavailable, keep the list visible and render a detail-pane unavailable state instead of collapsing the whole page.
- Keep the helper mapped strictly to the documented contract fields so the web layer does not invent status or control fields.

**Execution note:** Execution target: external-delegate. This unit should follow `next-best-practices`; if page structure or slice placement shifts, also reference `feature-sliced-design`.

**Patterns to follow:**

- `apps/web/app/page.tsx`
- `apps/web/app/page.spec.tsx`
- `docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md`
- `docs/en/api-designs/v0.1-first-vertical-slice-api.md`

**Test scenarios:**

- Happy path — when the API returns articles and no `articleId` is provided, the page renders the first article as the default detail.
- Happy path — when `searchParams.articleId` points at an existing article, the page renders that article's detail.
- Edge case — when the list endpoint returns an empty array, the page renders an empty state and skips detail fetching.
- Error path — when `API_BASE_URL` is missing, the page fails with an explicit configuration error rather than an opaque fetch failure.
- Error path — when a stale `articleId` produces a 404, the list still renders and the detail pane switches to an unavailable state.
- Integration — the detail pane's original link remains a plain anchor sourced from the API response rather than a web-invented URL; the left pane does not expose a separate original-link action.
- Integration — browser coverage in `apps/web/e2e/home.spec.ts` proves default first-article selection, URL updates with `articleId`, refresh persistence, and stale-article fallback against the running API.

**Verification:**

- The page has one clear web-to-API seam, article selection survives refresh/share through the URL, and the documented local API connection works without manual port guessing.

- [x] **Unit 4: Compose the dual-pane reader shell with shadcn/ui primitives**

**Goal:** Replace the template landing page with the first real dual-pane reader UI while staying inside the frozen contract and scope boundaries.

**Requirements:** R2, R3, R4, R5, R6, R7, R8, R9, R11, R12, R16

**Dependencies:** Unit 2, Unit 3

**Files:**

- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/page.spec.tsx`
- Create: `apps/web/components/article-list.tsx`
- Create: `apps/web/components/article-detail.tsx`
- Create: `apps/web/components/article-reader-shell.tsx`
- Test: `apps/web/e2e/home.spec.ts`

**Approach:**

- Use a small shadcn/ui primitive set such as `Card`, `Button`, `ScrollArea`, and `Separator` to build the desktop-first reader shell.
- Keep the left pane focused on title, source, and publication time, with the whole card used for in-app article switching. Keep the right pane focused on the selected article's title, source, publication time, summary, and original link.
- Make selection visually clear through Tailwind/shadcn styling and keep navigation URL-driven so the UI does not depend on a separate client-side store.
- Render empty and unavailable states with the same design system rather than leaving the template page or raw exception text in place.
- Replace the template page title/description and landing-page copy so `apps/web` no longer presents itself as a generic monorepo starter once the reader shell exists.

**Execution note:** Execution target: external-delegate. This unit must execute through `frontend-design` → `ui-ux-pro-max` → `ckm-design-system` → `ckm-ui-styling`, then validate the result through the `frontend-design` acceptance loop while preserving the `next-best-practices` and `feature-sliced-design` boundaries.

**Patterns to follow:**

- `apps/web/app/page.tsx`
- `apps/web/app/page.spec.tsx`
- `packages/ui/src/components/ui/*`
- `packages/ui/package.json` exports map

**Test scenarios:**

- Happy path — the page renders a scannable list in the left pane and the selected article summary in the right pane.
- Happy path — the selected article is visually distinguishable, and choosing another article updates the rendered detail.
- Edge case — long titles and long summaries remain readable via scrolling without collapsing the two-pane layout.
- Error path — empty-state and detail-unavailable-state UI render through the same shadcn/Tailwind shell rather than falling back to template markup.
- Integration — both panes expose `originalUrl` anchors as required by the API contract.
- Integration — browser-level navigation keeps the selected article encoded in `articleId`, and refreshing the page preserves the same detail view.

**Verification:**

- The web app looks and behaves like the intended first reading slice instead of a template page, its metadata and visible copy no longer read like starter-template text, and every visible field traces back to the documented contract.

- [x] **Unit 5: Add cross-app verification and developer-facing slice notes**

**Goal:** Prove the vertical slice end-to-end and document the minimal setup needed to run it locally.

**Requirements:** R1, R2, R3, R4, R7, R8, R9, R10, R11, R12, R16

**Dependencies:** Unit 1, Unit 2, Unit 3, Unit 4

**Files:**

- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/e2e/home.spec.ts`
- Modify: `apps/web/README.md`
- Modify: `apps/web/.env.example`

**Approach:**

- Replace the template browser test with a reader-flow test that exercises the real API contract instead of static template content.
- Configure browser verification so both the API and web app are available during the spec, and keep the environment contract explicit through `API_BASE_URL`.
- Lock the documented local wiring to the repo's current defaults: `apps/api` on port 3000 and `apps/web` on port 3001, with `API_BASE_URL=http://127.0.0.1:3000` as the example value.
- Document the local environment requirement and the pre-disclosed package additions in the web app README so the first slice is runnable without reverse-engineering the setup.
- Keep the fixture dataset small enough that end-to-end verification stays fast and deterministic.

**Execution note:** Execution target: external-delegate. Test wiring and README updates should still respect `next-best-practices` around Next.js environment and routing boundaries.

**Patterns to follow:**

- `apps/web/playwright.config.ts`
- `apps/web/e2e/home.spec.ts`
- `apps/api/test/app.e2e-spec.ts`

**Test scenarios:**

- Happy path — browser coverage lands on the reader, shows the article list, and renders the selected article detail.
- Happy path — choosing another article updates the URL and the detail pane.
- Edge case — a no-data scenario renders the empty-state shell without a runtime crash.
- Error path — when the API is unavailable during browser verification, the test fails fast with a readable error instead of hanging indefinitely.
- Integration — API e2e coverage and browser coverage together prove that the real HTTP contract works across both apps.

**Verification:**

- The repository has one narrow browser flow and matching API coverage that prove the first slice works across the actual app boundary, a teammate can run the slice locally without guessing ports or env names, and the old template smoke surfaces in both apps have been replaced by slice-relevant verification and documentation.

## System-Wide Impact

- **Interaction graph:** `apps/api/src/articles/fixtures/prepared-articles.json` feeds the article repository, which feeds the Nest service/controller pair, which in turn feeds the server-side article helper in `apps/web`, which finally drives the App Router page and its reader components.
- **Error propagation:** Unknown article IDs stay HTTP-level 404s in the API. The web layer should treat list-load failures as page-level failures and stale-detail failures as pane-level unavailable states without adding extra API fields.
- **State lifecycle risks:** Selected article state moves into the `articleId` URL parameter so refresh and share semantics remain stable without a client-only state store.
- **API surface parity:** The fixture shape, API controller responses, web helper types, and visible UI fields must all stay aligned with the API design docs.
- **Integration coverage:** A green result requires both API contract tests and browser-level verification with the real cross-app boundary.
- **Unchanged invariants:** This slice still does not implement OPML ingestion, persistence, auth, refresh controls, pagination, filters, or summary-status fields.
- Shared workspace tooling, lint/typecheck/test task wiring, and monorepo package boundaries remain intact even though app-level scaffold artifacts are removed.

## Risks & Dependencies

| Risk                                                                                                           | Mitigation                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Introducing `packages/ui` can add cross-workspace build and export complexity                                  | Keep `packages/ui` one-purpose and narrow, install dependencies only where used, use clear package exports instead of broad barrel files, and leave app-specific reader composition inside `apps/web`. |
| Avoiding a shared contract package could create drift between API and web                                      | Keep the contract tiny, centralize mapping in `apps/web/lib/articles-api.ts`, and rely on API e2e plus browser verification to catch parity breaks.                                                    |
| Cross-app browser verification can become flaky                                                                | Use a deterministic fixture dataset, keep the browser scenario narrow, and fail fast when the API is unavailable instead of letting tests hang.                                                        |
| Fixture-backed data can accidentally harden into a pseudo-production model                                     | Keep the fixture limited to prepared read items and isolate it behind the repository seam that later ingestion work can replace.                                                                       |
| `eslint-plugin-better-tailwindcss` may still have edge-case noise in the chosen Tailwind CSS v4 monorepo setup | Integrate the stable line first and validate with lint; if false positives or parsing issues appear, stop and ask the user before switching lint stacks, adding overrides, or removing rules.          |

## Documentation / Operational Notes

- Before `/ce:work` starts, repeat the currently known package additions to the user, grouped by owning package. Use `pnpm` to resolve the then-current latest stable versions, and if installation turns into dependency hell, stop and ask before adding overrides or forcing version pins.
- If implementation changes scope enough to alter the frozen API contract or the chosen frontend architecture, update this plan and its Chinese pair in the same pass.
- When removing template leftovers, update or delete the matching README/test copy in the same pass so no scaffold wording remains to contradict the shipped slice.
- Document `API_BASE_URL=http://127.0.0.1:3000` as the local example in `apps/web/README.md` and `apps/web/.env.example`, and keep it aligned with the repo's current default ports.
- Keep the monorepo best-practice boundary explicit: shared UI primitives live in `packages/ui`, while app-specific reader components and data access stay in `apps/web`.
- `apps/web/tailwind.config.js`, `apps/web/app/globals.css`, `packages/eslint-config`, and the root `.prettierrc.mjs` together form the durable Tailwind guardrail. Later implementation should not scatter theme/plugin/source rules elsewhere unless the bilingual plan is updated in the same pass.
- Execution must follow the `AGENTS.md` skill-level conventions: `apps/api` uses `nestjs-best-practices`; `apps/web` Next.js work uses `next-best-practices`; frontend architecture uses `feature-sliced-design`; frontend page design executes through `frontend-design` → `ui-ux-pro-max` → `ckm-design-system` → `ckm-ui-styling`. If a required skill cannot be applied cleanly, pause and reconcile before continuing.
- Continue following Turborepo's root-minimal rule: root should carry only repository-level tools such as the Prettier plugin/config, while Tailwind runtime, Radix runtime, and app/library dependencies stay in the workspace package that actually uses them.

## Sources & References

- **Origin documents:** `docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md`, `docs/en/api-designs/v0.1-first-vertical-slice-api.md`, `docs/zh-Hans/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`, `docs/en/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`
- **Related code:** `package.json`, `packages/eslint-config/next.js`, `apps/api/src/health.controller.ts`, `apps/api/src/health.controller.spec.ts`, `apps/api/test/app.e2e-spec.ts`, `apps/web/app/page.tsx`, `apps/web/app/page.spec.tsx`, `apps/web/e2e/home.spec.ts`, `apps/web/playwright.config.ts`
- **Institutional learning:** `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`, `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`
- **External docs:** `https://tailwindcss.com/docs/installation/framework-guides/nextjs`, `https://tailwindcss.com/docs/functions-and-directives`, `https://tailwindcss.com/docs/detecting-classes-in-source-files`, `https://ui.shadcn.com/docs/installation/manual`, `https://ui.shadcn.com/docs/monorepo`, `https://github.com/tailwindlabs/prettier-plugin-tailwindcss`, `https://github.com/schoero/eslint-plugin-better-tailwindcss`, `https://github.com/francoismassart/eslint-plugin-tailwindcss`, `https://raw.githubusercontent.com/vercel/turborepo/refs/heads/main/skills/turborepo/references/best-practices/RULE.md`
