# AGENTS.md

## Repository Structure

This repository is a Turborepo-based monorepo. Every action taken by an agent must preserve the monorepo structure and must not break the workspace layout, package boundaries, shared configuration, task graph, or repository-level conventions that keep the monorepo functioning correctly.

Agents must preserve the canonical Turborepo monorepo layout and boundaries described in `.agents/skills/turborepo/references/best-practices/RULE.md`. In particular, keep deployable applications under `apps/`, shared libraries and shared configuration under `packages/`, avoid introducing nested packages, and do not collapse package responsibilities into the repository root.

## Documentation Language Policy

All durable documentation must be maintained in synchronized Chinese and English versions.

- This applies to all documents under `docs/`, including plans, brainstorms, solution docs, and any other long-lived documentation.
- Chinese documents must live under `docs/zh-Hans/`.
- English documents must live under `docs/en/`.
- Every durable document created in one language must have a corresponding document in the other language.
- The paired Chinese and English documents must remain semantically synchronized. When updating one version, update the other in the same work so they do not drift.

## Repository Docs Convention

Use the language-scoped docs layout in this repository: `docs/en/` for English and `docs/zh-Hans/` for Simplified Chinese. Place each document in the matching category directory for both languages.

- Brainstorms live in `docs/{lang}/brainstorms/` - requirement exploration, ideation, option comparison, and early framing work.
- Plans live in `docs/{lang}/plans/` - implementation plans, milestones, delivery sequencing, and progress tracking.
- Solutions live in `docs/{lang}/solutions/` - documented decisions, recurring fixes, learned patterns, and operational guidance. also act as a searchable knowledge store for prior fixes, best practices, and workflow patterns; frontmatter fields such as `module`, `tags`, and `problem_type` help retrieval when implementing or debugging in documented areas.

### Solution Categories (`docs/{lang}/solutions/`)

Categorize solution docs from the perspective of someone building or operating this RSS project, not from a generic template repo. Put each solution in the closest matching category below.

- `developer-experience/` - local development setup, repository tooling, contributor workflow friction, shell/task ergonomics, CI/dev-loop issues, and other problems that mainly affect people working on this repo itself.
- `documentation-gaps/` - missing, unclear, outdated, or conflicting project documentation, including guidance that needs clarification for future contributors or operators.
- `integration-issues/` - problems where this project's integrations, generated outputs, or external platform behavior do not line up correctly, including cross-platform incompatibilities and third-party API/service mismatches.
- `workflow-issues/` - agent workflow patterns, skill design, orchestration improvements, repository process decisions, and repeatable execution guidance that changes how work gets done in this repo.

If a document does not fit an existing category cleanly, prefer the closest current category instead of inventing a new one unless the repository structure is intentionally being extended in both language trees.

## Skill-Level Conventions

- For frontend page design work, agents must invoke `frontend-design`, `ui-ux-pro-max`, `ckm-design-system`, and `ckm-ui-styling`. These four skills are complementary and mandatory for frontend design tasks.
- For frontend page design work, apply the skills in this order unless the user explicitly instructs otherwise: use `frontend-design` for context detection, design direction, and acceptance flow; use `ui-ux-pro-max` for visual and interaction guidance; use `ckm-design-system` for tokens, component states, and system rules; use `ckm-ui-styling` for implementation styling patterns and component-level frontend execution. Finish by validating the result against the `frontend-design` acceptance loop.
- For Turborepo, workspace, package-boundary, shared-package, root `package.json`, root `turbo.json`, pipeline, caching, filtering, task-graph, or monorepo-structure work, agents must invoke `turborepo`.
- For any repository-wide or package-topology change, agents must follow `.agents/skills/turborepo/references/best-practices/RULE.md` as the default monorepo structure authority and must keep the repository aligned with its guidance on `apps/` vs `packages/`, package purpose boundaries, internal package organization, and root-level responsibility.
- When changing Turborepo task wiring, agents must preserve package-local task ownership: define executable task logic inside the relevant package, register orchestration in root `turbo.json`, and keep the root `package.json` limited to delegation such as `turbo run <task>` unless a true root-only task is justified.
- For `apps/web` Next.js implementation work, agents must invoke `next-best-practices`.
- For `apps/web` frontend architecture work, agents must also reference `feature-sliced-design`.
- When `next-best-practices` and `feature-sliced-design` overlap, resolve the conflict with these rules:
  - Next.js owns framework entry semantics and special-file conventions. Keep the root-level `app/` as the App Router entry and place framework-required files such as `layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`, `default.tsx`, and `route.ts` there when required by Next.js.
  - FSD owns business structure inside `src/`, but do **not** create `src/pages` in `apps/web`. Next.js treats `src/pages` as a Pages Router root, which conflicts with the root App Router `app/` directory. Adapt the FSD layering around this framework rule instead of fighting it.
  - In `apps/web`, prefer `src/app`, `src/widgets`, `src/features`, `src/entities`, and `src/shared` for business structure. If you need a page-scoped business slice, keep it under `src/app` or `src/widgets` with a route-aligned name rather than introducing `src/pages`.
  - Keep the root-level `app/` thin: route entrypoints, top-level providers, metadata wiring, route handlers, and minimal bridge code only. Do not turn the root-level `app/` into the main container for reusable business slices.
  - Follow `next-best-practices` first for RSC boundaries, Server Components vs Client Components, Server Actions, route handlers, metadata, async Next.js APIs, and runtime constraints.
  - Follow `feature-sliced-design` first for slice boundaries, public API usage, import direction, and Pages First decomposition inside the business layer.
  - If an FSD placement conflicts with a required Next.js convention, preserve the Next.js convention and adapt the FSD placement around it rather than changing framework entry semantics. The `src/pages` vs root `app/` collision is an explicit example of this rule.
- For `apps/api` NestJS implementation work, agents must invoke `nestjs-best-practices`.
- For `apps/api` backend architecture, agents must follow `.agents/skills/nestjs-best-practices/rules/arch-feature-modules.md` and organize code by feature modules. Prefer self-contained feature folders that group controllers, services, DTOs, entities, repositories, and module definitions together. Avoid repository-wide technical-layer folders unless a deeper scoped rule explicitly overrides this.
