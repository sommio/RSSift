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
