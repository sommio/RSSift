# AGENTS.md

## Repository Structure

This repository is a Turborepo-based monorepo. Every action taken by an agent must preserve the monorepo structure and must not break the workspace layout, package boundaries, shared configuration, task graph, or repository-level conventions that keep the monorepo functioning correctly.

## Agent Behavior

The agent should default to delegation in all cases, not only when deciding whether to invoke a skill. For every non-trivial task, first judge whether a sub-agent can perform the work more cleanly and with a narrower context than the primary agent. Before starting work, explicitly determine which sub-agent is the best fit based on the task's domain, scope, risk, and acceptance criteria. If a suitable sub-agent exists, delegate the work to that sub-agent by default and let it execute the task, including any relevant skill usage. The primary agent should remain focused on orchestration, integration, decision-making, and strict acceptance of the delegated result. The primary agent should only perform work directly when delegation is clearly counterproductive, such as for trivial actions, tightly coupled follow-up edits, or cases where delegation would add unnecessary coordination overhead. After delegated work returns, the primary agent must review the result critically, verify the behavior, and only accept changes that satisfy the original request. Use sub-agents aggressively to keep the main agent context clean, route work to the most appropriate executor, and reserve the primary agent for judgment, integration, and final verification.

## Documentation Language Policy

All durable documentation must be maintained in synchronized Chinese and English versions.

- This applies to all documents under `docs/`, including plans, design docs, brainstorms, ideation artifacts, solution docs, and any other long-lived documentation.
- Chinese documents must live under `docs/zh-Hans/`.
- English documents must live under `docs/en/`.
- Solution docs must follow the same bilingual structure: `docs/zh-Hans/solutions/` for Chinese and `docs/en/solutions/` for English.
- Every durable document created in one language must have a corresponding document in the other language.
- The paired Chinese and English documents must remain semantically synchronized. When updating one version, update the other in the same work so they do not drift.
- Plans should follow the same rule: if a plan is written to `docs/zh-Hans/plans/`, the matching English version must be written to `docs/en/plans/`, and vice versa.

## Skill-Level Conventions

- For frontend page design work, agents must invoke `frontend-design`, `ui-ux-pro-max`, `ckm-design-system`, and `ckm-ui-styling`. These four skills are complementary and mandatory for frontend design tasks.
- For frontend page design work, apply the skills in this order unless the user explicitly instructs otherwise: use `frontend-design` for context detection, design direction, and acceptance flow; use `ui-ux-pro-max` for visual and interaction guidance; use `ckm-design-system` for tokens, component states, and system rules; use `ckm-ui-styling` for implementation styling patterns and component-level frontend execution. Finish by validating the result against the `frontend-design` acceptance loop.
- For `apps/web` Next.js implementation work, agents must invoke `next-best-practices`.
- For `apps/web` frontend architecture work, agents must also reference `feature-sliced-design`.
- When `next-best-practices` and `feature-sliced-design` overlap, resolve the conflict with these rules:
  - Next.js owns framework entry semantics and special-file conventions. Keep the root-level `app/` as the App Router entry and place framework-required files such as `layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx`, `default.tsx`, and `route.ts` there when required by Next.js.
  - FSD owns business structure inside `src/`. Put business-facing layers in `src/app`, `src/pages`, `src/widgets`, `src/features`, `src/entities`, and `src/shared`.
  - Keep the root-level `app/` thin: route entrypoints, top-level providers, metadata wiring, route handlers, and minimal bridge code only. Do not turn the root-level `app/` into the main container for reusable business slices.
  - Follow `next-best-practices` first for RSC boundaries, Server Components vs Client Components, Server Actions, route handlers, metadata, async Next.js APIs, and runtime constraints.
  - Follow `feature-sliced-design` first for slice boundaries, public API usage, import direction, and Pages First decomposition inside the business layer.
  - If an FSD placement conflicts with a required Next.js convention, preserve the Next.js convention and adapt the FSD placement around it rather than changing framework entry semantics.
- For `apps/api` NestJS implementation work, agents must invoke `nestjs-best-practices`.
- For `apps/api` backend architecture, agents must follow `.agents/skills/nestjs-best-practices/rules/arch-feature-modules.md` and organize code by feature modules. Prefer self-contained feature folders that group controllers, services, DTOs, entities, repositories, and module definitions together. Avoid repository-wide technical-layer folders unless a deeper scoped rule explicitly overrides this.
