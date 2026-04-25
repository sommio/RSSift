# AGENTS.md

## Repository Structure

Repo = Turborepo monorepo.
Keep monorepo shape.
No break workspace layout, package boundaries, shared config, task graph, repo conventions.

Follow canonical Turborepo layout in `.agents/skills/turborepo/references/best-practices/RULE.md`.
Keep deployable apps in `apps/`.
Keep shared libs + shared config in `packages/`.
No nested packages.
No move package responsibility to repo root.

## Documentation Language Policy

All durable docs stay synced in Chinese + English.

- Rule covers all docs under `docs/`: plans, brainstorms, solutions, other long-life docs.
- Chinese docs in `docs/zh-Hans/`.
- English docs in `docs/en/`.
- If one language doc exists, matching other-language doc must exist.
- Both versions stay same meaning. Update both in same work. No drift.

## Repository Docs Convention

Use language-scoped layout: `docs/en/` = English, `docs/zh-Hans/` = Simplified Chinese.
Put each doc in matching category dir for both languages.

- Brainstorms in `docs/{lang}/brainstorms/` - requirements, ideas, options, early framing.
- Plans in `docs/{lang}/plans/` - implementation plans, milestones, delivery order, progress tracking.
- Solutions in `docs/{lang}/solutions/` - decisions, repeat fixes, learned patterns, ops guidance; also searchable knowledge store. Frontmatter like `module`, `tags`, `problem_type` helps retrieval for implementation/debugging.

### Solution Categories (`docs/{lang}/solutions/`)

Classify from RSS builder/operator view, not generic template view.
Use closest category below.

- `developer-experience/` - local setup, repo tooling, contributor workflow pain, shell/task ergonomics, CI/dev-loop trouble, other repo-worker problems.
- `documentation-gaps/` - missing, unclear, stale, conflicting docs; guidance needing future clarification.
- `integration-issues/` - project integrations, generated outputs, external platform behavior mismatch; cross-platform issues; third-party API/service mismatch.
- `workflow-issues/` - agent workflow patterns, skill design, orchestration improvements, repo process decisions, repeatable execution guidance.

If none fits perfect, use closest existing category.
No add new category unless both language trees expand on purpose.

## Skill-Level Conventions

- For Turborepo, workspace, package-boundary, shared-package, root `package.json`, root `turbo.json`, pipeline, caching, filtering, task-graph, or monorepo-structure work, invoke `turborepo`.
- For repo-wide or package-topology changes, follow `.agents/skills/turborepo/references/best-practices/RULE.md` as monorepo authority. Keep repo aligned on `apps/` vs `packages/`, package purpose boundaries, internal package organization, root responsibility.
- When changing Turborepo task wiring, keep package-local task ownership: executable task logic in right package, orchestration in root `turbo.json`, root `package.json` mostly delegation like `turbo run <task>` unless true root-only task.
- For `apps/web` Next.js implementation work, invoke `next-best-practices`.
- For `apps/web` frontend architecture work, also reference `feature-sliced-design`.
- When `next-best-practices` and `feature-sliced-design` overlap, use rules below:
  - Next.js owns framework entry semantics + special files. Keep root `app/` as App Router entry. Put required files like `layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`, `default.tsx`, `route.ts` there when Next.js requires.
  - FSD owns business structure inside `src/`, but do **not** create `src/pages` in `apps/web`. Next.js treats `src/pages` as Pages Router root; this conflicts with root App Router `app/`. Bend FSD around framework rule.
  - In `apps/web`, prefer `src/app`, `src/widgets`, `src/features`, `src/entities`, `src/shared` for business structure. If page-scoped business slice needed, keep under `src/app` or `src/widgets` with route-aligned name. No add `src/pages`.
  - Keep root `app/` thin: route entrypoints, top-level providers, metadata wiring, route handlers, minimal bridge code only. No make root `app/` main home for reusable business slices.
  - Follow `next-best-practices` first for RSC boundaries, Server vs Client Components, Server Actions, route handlers, metadata, async Next.js APIs, runtime constraints.
  - Follow `feature-sliced-design` first for slice boundaries, public API usage, import direction, Pages First decomposition inside business layer.
  - If FSD placement conflicts with required Next.js convention, keep Next.js convention and bend FSD around it. `src/pages` vs root `app/` = explicit example.
- For `apps/api` NestJS implementation work, invoke `nestjs-best-practices`.
- For `apps/api` backend architecture, follow `.agents/skills/nestjs-best-practices/rules/arch-feature-modules.md` and organize by feature modules. Prefer self-contained feature folders grouping controllers, services, DTOs, entities, repositories, module defs. Avoid repo-wide tech-layer folders unless deeper scoped rule overrides.

## Plan Completion Checks

- After finishing a plan, check if GitHub Actions need updates; if yes, update relevant workflow files in same work.
- Before handoff, run full repo validation from root: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e`.
- If any command fails, fix root issue first and rerun full set before closing turn.

## Git Hook Discipline

- Never bypass Git hooks or hook-time checks with flags that suppress warnings, ignore files, or hide failure.
- If a hook or staged check fails, fix underlying config or code first.
  Do not use `--no-warn-ignored`, `--quiet`, or similar skip-style workarounds to make hook pass.
- Keep hook behavior honest: passing commit or push means check really ran and passed, not got silenced.
