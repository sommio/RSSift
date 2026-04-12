---
title: feat: Define the first vertical slice API within v0.1
type: feat
status: completed
date: 2026-04-09
origin:
  - docs/zh-Hans/diagrams/v0.1-diagrams.md
  - docs/en/diagrams/v0.1-diagrams.md
  - tmp/v0.1/v0.1.md
  - docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md
  - docs/en/api-designs/v0.1-first-vertical-slice-api.md
---

# feat: Define the first vertical slice API within v0.1

## Overview

This plan defines only the API design for the first vertical slice within `rss-start v0.1`. It does not enter code implementation. The goal is to reduce “how the desktop dual-pane reader reads prepared reading material” into a minimal, stable, implementation-ready read contract so later implementation and frontend integration do not have to reinvent the API shape.

## Problem Frame

The current product docs already define the core v0.1 semantics: the system reads subscriptions from `config.opml`, pulls feeds, prepares reading material, and then the desktop dual-pane UI consumes that prepared material to help the user decide whether to open the source link.

This planning pass is not about how to write NestJS modules or how to store data. It is about deciding what the API should look like first. For the first vertical slice, the highest-value move is to compress the external contract to the minimum:

- the frontend only reads and does not control backend workflows;
- titles stay in the source language;
- summaries may be simple non-LLM outputs;
- both list and detail support opening the original article;
- internal states, failure paths, and backend actions do not leak into the public contract.

## Requirements Trace

- R1. The API must expose read paths only and must not expose refresh, retry, summary-generation, or feed-management actions.
- R2. The API must cover the dual-pane reader's minimum read loop: article list for the left pane and article detail for the right pane.
- R3. The list response must return `id`, `title`, `sourceTitle`, `publishedAt`, and `originalUrl`.
- R4. The detail response must return `title`, `sourceTitle`, `publishedAt`, `summary`, and `originalUrl`.
- R5. The first vertical slice within v0.1 must not design title translation, summary-status fields, degradation/failure fields, pagination/filtering, or multiple summary layers.
- R6. The API design must stay aligned with `docs/zh-Hans/diagrams/v0.1-diagrams.md` and `docs/en/diagrams/v0.1-diagrams.md`: the frontend reads “prepared reading items.”

## Scope Boundaries

- Do not design operation endpoints such as `POST /articles/:id/summary/generate` or `POST /feeds/:id/refresh`.
- Do not design feed CRUD, OPML import/export, read/save state, auth, or multi-user behavior.
- Do not design LLM APIs, prompt structures, or summary algorithm details.
- Do not design database schemas, queues, schedulers, or cache strategy.
- Do not encode internal fetch/body/summary failures as public contract fields.

## Context & Research

### Relevant Product and Repo Context

- `docs/zh-Hans/diagrams/v0.1-diagrams.md` and `docs/en/diagrams/v0.1-diagrams.md` already reduce v0.1 to the product model of “prepare reading material -> dual-pane reading -> optional jump to the source.”
- `tmp/v0.1/v0.1.md` is the earlier source concept doc and still contains broader ideas such as title translation and richer summary design; this round intentionally narrows the surface.
- The repo's `apps/api` and `apps/web` are still skeletons, so this plan does not rely on an existing business API pattern. It defines the first business-facing contract boundary.

### Institutional Learnings

- `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md` and its English pair warn that once product semantics are clarified, downstream plans must inherit them explicitly instead of reintroducing stale assumptions.
- The most important inherited semantics here are: system-prepared reading material, open-original as an external jump action, and a dual-pane reader that consumes prepared data.

### External References

- No additional external API conventions are introduced. This round is driven by current product semantics and scope control rather than framework-level implementation design.

## Key Technical Decisions

- Define exactly two public read endpoints: `GET /articles` and `GET /articles/:id`. This exactly covers the dual-pane UI's minimum read needs while keeping the frontend unaware of backend workflow control.
- Return `originalUrl` from the list endpoint too. This is a confirmed product requirement: users may jump directly from the left pane or inspect the right-pane summary first.
- Keep the detail response minimal and do not add forward-looking fields such as `summaryStatus`, `contentAvailable`, or `excerpt`. The first slice is about “can the user read and decide,” not “can the system explain temporary incompleteness.”
- Treat `summary` as a prepared field, not a resource that must be explicitly generated through a public action. This preserves the product meaning that the frontend reads prepared material rather than managing a generation workflow.
- Keep titles untranslated and allow summaries to come from a simple non-LLM strategy. This decision constrains both the public field set and the backend complexity of the first slice.

## Open Questions

### Resolved During Planning

- Should the API stay read-only? Yes.
- Should the list include `originalUrl`? Yes.
- Should the detail response stay minimal? Yes.
- Should titles be translated? No.
- Must summaries be generated by an LLM? No.

### Deferred to Implementation

- The final encoding of `id`, such as UUID, hash, or internal identifier mapping.
- The final time-format rules for `publishedAt`, such as the exact ISO 8601 constraint.
- The internal fallback strategy for `summary` when body content is weak or missing.
- How the server internally triggers first-load preparation from `config.opml` and later refreshes.

## High-Level Technical Design

> _This section communicates API direction for review. It is a contract sketch, not implementation specification. Future implementers should treat it as interface guidance, not code structure._

### API Surface

| Method | Path            | Purpose                                                           |
| ------ | --------------- | ----------------------------------------------------------------- |
| `GET`  | `/articles`     | Return the minimum article list needed by the left pane           |
| `GET`  | `/articles/:id` | Return the minimum single-article detail needed by the right pane |

### Contract Sketch

**1. `GET /articles`**

Purpose:

- provide a scanable article list for the left pane;
- support direct jump-out to the original article;
- avoid taking on detail rendering, status reporting, or backend control responsibilities.

Response sketch:

```json
[
  {
    "id": "article_001",
    "title": "Example article title",
    "sourceTitle": "Example Feed",
    "publishedAt": "2026-04-09T08:00:00Z",
    "originalUrl": "https://example.com/article-1"
  }
]
```

Field notes:

- `id`: stable identifier used by the frontend to request detail
- `title`: original article title, not translated
- `sourceTitle`: displayable feed/source name
- `publishedAt`: article publication time
- `originalUrl`: original source link for direct jump-out

**2. `GET /articles/:id`**

Purpose:

- provide the minimum decision material for one article in the right pane;
- let the user read a prepared summary before deciding to jump to the original;
- avoid returning backend state, generation progress, or extra action hooks.

Response sketch:

```json
{
  "title": "Example article title",
  "sourceTitle": "Example Feed",
  "publishedAt": "2026-04-09T08:00:00Z",
  "summary": "This is a short deterministic summary prepared by the server.",
  "originalUrl": "https://example.com/article-1"
}
```

Field notes:

- `title`: original article title, not translated
- `sourceTitle`: feed/source name
- `publishedAt`: article publication time
- `summary`: server-prepared short summary
- `originalUrl`: original source link

### Explicitly Out of Contract

Even if these concepts exist internally later, they do not belong in the public API contract of the first vertical slice within v0.1:

- `summaryStatus`
- `contentAvailable`
- `excerpt`
- `translation`
- `regenerateSummaryAction`
- `refreshFeedAction`
- failure reasons or retry suggestions
- `POST /articles/:id/summary/generate`
- `POST /feeds/:id/refresh`

## Implementation Units

- [x] **Unit 1: Freeze the public API surface**

**Goal:** Make it explicit that the first vertical slice exposes exactly two read endpoints and does not drift into backend control APIs.

**Requirements:** R1, R2, R6

**Dependencies:** None

**Files:**

- Modify: `docs/zh-Hans/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`
- Modify: `docs/en/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`

**Approach:**

- Fix the surface at `/articles` and `/articles/:id`.
- Explicitly list the operation endpoints and backend-status fields that are not part of this slice.

**Patterns to follow:**

- Stay aligned with the product expression in `docs/zh-Hans/diagrams/v0.1-diagrams.md` and `docs/en/diagrams/v0.1-diagrams.md`.

**Test scenarios:**

- Test expectation: none -- this unit narrows API design scope and does not define runtime behavior.

**Verification:**

- Anyone reading this plan can clearly see that this API slice has only two read endpoints and no third class of control endpoint.

- [x] **Unit 2: Freeze the list and detail contracts**

**Goal:** Lock the field sets needed by the dual-pane UI during planning rather than leaving them open-ended for implementation.

**Requirements:** R2, R3, R4, R5

**Dependencies:** Unit 1

**Files:**

- Modify: `docs/zh-Hans/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`
- Modify: `docs/en/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`

**Approach:**

- Keep the list focused on minimum scan-and-jump fields.
- Keep the detail focused on minimum decide-and-jump fields.
- Avoid reserving future state fields so frontend and implementation scope do not grow prematurely.

**Patterns to follow:**

- Keep field semantics synchronized across the Chinese and English plan docs.

**Test scenarios:**

- Test expectation: none -- this unit defines interface contracts rather than implementation tests.

**Verification:**

- Implementers and frontend collaborators no longer need to debate whether the list includes URL or whether detail includes status fields.

- [x] **Unit 3: Freeze non-goals and future leave-behinds**

**Goal:** Record what does not belong in the first vertical slice API so the design does not regrow complexity in later discussions.

**Requirements:** R1, R5, R6

**Dependencies:** Unit 1, Unit 2

**Files:**

- Modify: `docs/zh-Hans/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`
- Modify: `docs/en/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`

**Approach:**

- Explicitly enumerate the fields and actions that do not enter the contract.
- Keep implementation-layer questions deferred to implementation rather than disguising them as API requirements.

**Patterns to follow:**

- Preserve the repo's bilingual durable-doc sync rule.

**Test scenarios:**

- Test expectation: none -- this unit is scope control, not test design.

**Verification:**

- Before `/ce:work`, the team has written agreement on what this API slice does not solve.

## System-Wide Impact

- **Interaction graph:** This design defines only the read surface between the Web UI and the API; it does not define internal backend module boundaries.
- **Error propagation:** The public contract keeps only normal read semantics; internal fetch/body/summary failures remain outside the API surface.
- **API surface parity:** Any later frontend data-fetching layer or shared type package should align to these two contracts.
- **Unchanged invariants:** `config.opml` remains the subscription-source input in product semantics; the dual-pane reader still consumes prepared reading material; opening the original remains an external jump-out action.

## Risks & Dependencies

| Risk                                                                       | Mitigation                                                                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Reserving too many future fields during design defocuses the first slice   | Hold the line on a minimal list contract and a minimal detail contract                        |
| Internal failure handling leaks into the public surface as a state machine | Explicitly prohibit status, failure reason, and control-action fields in the current contract |
| API design and implementation design get mixed together                    | Keep this plan focused on “what the API looks like,” not “how the code is written”            |
| The Chinese and English API docs drift in meaning                          | Keep this pair of plan docs synchronized as durable bilingual docs                            |

## Documentation / Operational Notes

- If this needs to go deeper later, add a requirements doc or an implementation plan rather than polluting the current API contract.
- If a future change expands the API surface, such as pagination or refresh, raise it in a new brainstorm/plan instead of silently changing the current slice semantics.
- Keep the Chinese and English docs synchronized.

## Sources & References

- Deliverable: `docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md` and `docs/en/api-designs/v0.1-first-vertical-slice-api.md`.
- Product docs: `docs/zh-Hans/diagrams/v0.1-diagrams.md`, `docs/en/diagrams/v0.1-diagrams.md`
- Source concept: `tmp/v0.1/v0.1.md`
- Institutional learning: `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`, `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`
