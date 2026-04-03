# AGENTS

## Delegation First

The agent should default to delegation in all cases, not only when deciding whether to invoke a skill.

- For every non-trivial task, first judge whether a sub-agent can perform the work more cleanly and with a narrower context than the primary agent.
- Before starting work, explicitly determine which sub-agent is the best fit based on the task's domain, scope, risk, and acceptance criteria.
- If a suitable sub-agent exists, delegate the work to that sub-agent by default and let it execute the task, including any relevant skill usage.
- The primary agent should remain focused on orchestration, integration, decision-making, and strict acceptance of the delegated result.
- The primary agent should only perform work directly when delegation is clearly counterproductive, such as for trivial actions, tightly coupled follow-up edits, or cases where delegation would add unnecessary coordination overhead.
- After delegated work returns, the primary agent must review the result critically, verify the behavior, and only accept changes that satisfy the original request.

## Goal

Use sub-agents aggressively to keep the main agent context clean, route work to the most appropriate executor, and reserve the primary agent for judgment, integration, and final verification.