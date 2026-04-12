---
title: feat: Define bilingual v0.1 product diagram docs
type: feat
status: completed
date: 2026-04-09
---

# feat: Define bilingual v0.1 product diagram docs

## Overview

This plan defines a documentation-only deliverable for `tmp/v0.1/v0.1.md`: produce one Chinese diagram doc in `docs/zh-Hans/` and one English diagram doc in `docs/en/`, and keep them synchronized as a durable bilingual pair. The goal is to clarify the product shape of the v0.1 RSS MVP through a small, stable set of Mermaid diagrams focused on the core user value, not implementation detail.

## Problem Frame

The current v0.1 pitch already contains useful diagram ideas, but it mixes product flow with engineering fallback logic. For this planning pass, the target is narrower: decide what should be drawn, in what order, and in which bilingual document structure, so the diagrams communicate the MVP clearly to a product/design audience.

The source concept is the v0.1 RSS MVP described in `tmp/v0.1/v0.1.md`: an RSS workflow that pre-processes fetched articles, generates titles and two-layer summaries in the user-configured target language, and presents them in a desktop dual-pane reading UI.

## Requirements Trace

- R1. Produce two diagram documents: one Chinese doc under `docs/zh-Hans/` and one English doc under `docs/en/`.
- R2. Keep the diagrams product-facing: focus on user journey, information flow, and MVP boundaries rather than engineering failure handling.
- R3. Reduce scope to only the diagrams necessary to explain the MVP clearly.
- R4. Keep the Chinese and English docs semantically aligned so they describe the same product model and are updated together.
- R5. Preserve the core MVP thesis: users scan titles in the configured language, open an item to inspect pre-generated summaries, then decide whether to open the source link in a new tab.
- R6. Align the document locations with the repo-wide bilingual documentation rule: Chinese under `docs/zh-Hans/*`, English under `docs/en/*`.

## Scope Boundaries

- No implementation planning for backend, storage, scheduling, or frontend engineering.
- No edge-case, retry, fallback, or degradation diagrams in this pass.
- No expansion into mobile, auth, ranking, recommendation, or advanced feed-management behavior.
- No attempt to finalize prompt design, schema design, or runtime states.

## Context & Research

### Relevant Code and Patterns

- Repo structure is a Turborepo monorepo with `apps/`, `packages/`, and no existing top-level `docs/` tree yet.
- The current source material lives in `tmp/v0.1/v0.1.md` and already includes three draft Mermaid diagrams plus breadboard/sketch references.
- The request explicitly re-scopes the work from implementation thinking to product-manager-style diagram planning.
- The repository-level `AGENTS.md` now requires all durable docs, including plans, to be maintained as synchronized Chinese and English pairs under `docs/zh-Hans/*` and `docs/en/*`.

### Institutional Learnings

- No `docs/solutions/` directory or prior institutional learnings were found for this topic.

### External References

- None. This plan is grounded only in the current repo and source pitch.

## Key Technical Decisions

- Use exactly two canonical diagrams for v0.1 documentation: one system-level concept flow and one user reading flow. This keeps the MVP explanation tight and removes edge-case-driven visuals.
- Mirror the same diagram set in both language docs instead of maintaining different diagram shapes per language. This prevents conceptual drift between `docs/zh-Hans/` and `docs/en/`.
- Treat `tmp/v0.1/v0.1.md` as the source concept, but move the durable diagram docs into `docs/zh-Hans/` and `docs/en/`. This separates rough shaping material from stable product documentation.
- Treat synchronization as a first-class deliverable, not a follow-up cleanup task. Chinese and English docs should be authored as a pair and reviewed for semantic parity in the same pass.
- Exclude the existing fallback/state diagram from the first documentation pass because it over-indexes on failure handling and implementation concerns that the current MVP explicitly wants to avoid.

## Open Questions

### Resolved During Planning

- How many diagrams should the docs contain? Two: one concept/data flow diagram and one reading journey diagram.
- Should the docs discuss failure paths? No. Those are intentionally out of scope for this MVP documentation pass.
- Should the bilingual docs differ structurally? No. They should share the same structure and diagram inventory.

### Deferred to Implementation

- Exact service names, module boundaries, and storage terminology.
- Whether the eventual product uses polling, manual refresh, or another fetch trigger in implementation.
- Whether future versions need operational or state diagrams once the product starts running.

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce._

| Doc                                                                      | Audience role                       | Purpose                                               | Canonical contents                                       |
| ------------------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| `docs/zh-Hans/diagrams/v0.1-diagrams.md`                                 | Chinese product/design discussion   | Confirm the MVP in the team's primary language        | Context summary + Diagram 1 + Diagram 2 + short captions |
| `docs/en/diagrams/v0.1-diagrams.md`                                      | English-facing collaboration/review | Preserve the same product model for bilingual readers | Overview + Diagram 1 + Diagram 2 + short captions        |
| `docs/zh-Hans/plans/2026-04-09-001-feat-v0-1-bilingual-diagrams-plan.md` | Chinese planning artifact           | Source-of-truth planning doc for this work            | Same plan structure as English version                   |
| `docs/en/plans/2026-04-09-001-feat-v0-1-bilingual-diagrams-plan.md`      | English planning artifact           | Synced bilingual planning copy                        | Same plan structure as Chinese version                   |

Synchronization rule:

- Both diagram files are a locked pair.
- Both plan files are a locked pair.
- Any diagram added, removed, renamed, or reframed in one language must be updated in the other language in the same change.
- Captions may be phrased idiomatically by language, but the underlying product meaning must match.

Canonical diagram set:

1. **MVP concept flow**
   - Purpose: show the product closed loop from OPML/feed ingestion to configured-language title list, pre-generated summaries, and optional source-link opening in a new tab.
   - What it should emphasize: the product pipeline that prepares reading decisions in advance.
   - What it should avoid: fallback branches, retries, timeout logic, or internal engineering components that do not change the product story.

2. **Reader journey in the desktop UI**
   - Purpose: show how a reader moves from scanning configured-language titles to opening an article summary and deciding whether to open the source link in a new tab.
   - What it should emphasize: list-view decision, summary-view decision, and the optional exit action of opening the source link in a new tab.
   - What it should avoid: runtime status permutations, loading-state trees, or implementation-owned API choreography.

## Implementation Units

- [x] **Unit 1: Lock the canonical diagram set and bilingual narrative boundary**

**Goal:** Define exactly which diagrams belong in v0.1 product documentation, which existing draft diagrams should be excluded, and how the Chinese/English documents stay synchronized.

**Requirements:** R2, R3, R4, R5, R6

**Dependencies:** None

**Files:**

- Reference: `tmp/v0.1/v0.1.md`
- Create: `docs/zh-Hans/diagrams/v0.1-diagrams.md`
- Create: `docs/en/diagrams/v0.1-diagrams.md`
- Create: `docs/zh-Hans/plans/2026-04-09-001-feat-v0-1-bilingual-diagrams-plan.md`
- Create: `docs/en/plans/2026-04-09-001-feat-v0-1-bilingual-diagrams-plan.md`

**Approach:**

- Use the current v0.1 pitch as the source of truth for product intent.
- Keep only the two diagrams that explain the MVP to a product/design reader.
- Apply the repo bilingual-doc rule to the plan artifact itself, not just the eventual diagram docs.
- Explicitly drop the state/fallback diagram from the first pass so the docs do not drift into implementation detail.

**Patterns to follow:**

- Prefer concise Markdown sections with Mermaid blocks embedded near the explanation.
- Keep both language docs structurally parallel.

**Test scenarios:**

- Test expectation: none -- this unit defines documentation scope and bilingual narrative boundaries only.

**Verification:**

- A reviewer can name the exact two diagrams to be created, explain why the third draft diagram is excluded, and confirm the bilingual sync rule for both docs and plans.

- [x] **Unit 2: Author the Chinese source-of-truth diagram doc**

**Goal:** Produce the Chinese diagram document as the primary product discussion artifact.

**Requirements:** R1, R2, R3, R5, R6

**Dependencies:** Unit 1

**Files:**

- Create: `docs/zh-Hans/diagrams/v0.1-diagrams.md`
- Reference: `tmp/v0.1/v0.1.md`

**Approach:**

- Open with a compact summary of the v0.1 product promise.
- Present Diagram 1 as the system/product concept flow.
- Present Diagram 2 as the desktop reader journey.
- Add short captions under each diagram clarifying what decision the diagram helps stakeholders make.

**Patterns to follow:**

- Use Chinese terminology consistent with `tmp/v0.1/v0.1.md`.
- Keep the writing at product-spec level, not implementation-plan level.

**Test scenarios:**

- Test expectation: none -- this unit creates a human-readable product document, not runtime behavior.

**Verification:**

- A Chinese reader can understand the MVP by reading this file alone without opening implementation docs.

- [x] **Unit 3: Mirror the English diagram doc from the same product model**

**Goal:** Produce an English version that preserves the same product meaning and diagram structure.

**Requirements:** R1, R4, R5, R6

**Dependencies:** Unit 2

**Files:**

- Create: `docs/en/diagrams/v0.1-diagrams.md`
- Reference: `docs/zh-Hans/diagrams/v0.1-diagrams.md`

**Approach:**

- Translate for semantic equivalence rather than literal line-by-line matching.
- Keep headings, diagram order, and diagram meaning aligned with the Chinese doc.
- Preserve the same scope discipline so the English doc does not reintroduce engineering detail.
- Treat the Chinese and English docs as a synchronized pair that must be reviewed together before acceptance.

**Patterns to follow:**

- Match section order with `docs/zh-Hans/diagrams/v0.1-diagrams.md`.
- Use clear product language that can be shared with collaborators who did not read the Chinese source.

**Test scenarios:**

- Test expectation: none -- this unit creates bilingual documentation parity only.

**Verification:**

- A bilingual reviewer can compare both files and confirm they describe the same MVP with the same two diagrams.

## System-Wide Impact

- **Interaction graph:** This plan affects only durable product documentation under `docs/`; it does not change app behavior.
- **Error propagation:** None in this planning scope.
- **State lifecycle risks:** The main risk is conceptual drift, where diagram scope expands back into engineering states.
- **API surface parity:** The Chinese and English docs, plus the paired Chinese and English plan docs, are the parity surfaces that must remain aligned.
- **Integration coverage:** Cross-document consistency review is the primary quality check.
- **Unchanged invariants:** `tmp/v0.1/v0.1.md` remains the shaping/source artifact; this plan does not require rewriting application code or product scope.

## Risks & Dependencies

| Risk                                                 | Mitigation                                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Diagram scope drifts back into implementation detail | Keep the canonical set to two product-facing diagrams and explicitly exclude fallback/state visuals |
| Chinese and English docs diverge in meaning          | Author the Chinese doc first and mirror the English doc from it                                     |
| The plan itself violates the bilingual docs policy   | Maintain paired plan files under `docs/zh-Hans/plans/` and `docs/en/plans/`                         |
| Diagram captions become vague or generic             | Tie each caption to one stakeholder question the diagram answers                                    |

## Documentation / Operational Notes

- Create `docs/zh-Hans/` and `docs/en/` if they do not yet exist.
- Create `docs/zh-Hans/plans/` and `docs/en/plans/` so the plan artifact also follows the bilingual docs policy.
- Treat the Chinese doc as the wording anchor for future revisions unless the product team decides otherwise.
- Keep the Chinese and English plan files synchronized alongside the diagram docs; do not update only one side.
- If later versions need engineering-state diagrams, place them in a separate technical or implementation-oriented document rather than expanding this MVP diagram doc.

## Sources & References

- Source concept: `tmp/v0.1/v0.1.md`
- Target docs: `docs/zh-Hans/diagrams/v0.1-diagrams.md`, `docs/en/diagrams/v0.1-diagrams.md`
- Target plan docs: `docs/zh-Hans/plans/2026-04-09-001-feat-v0-1-bilingual-diagrams-plan.md`, `docs/en/plans/2026-04-09-001-feat-v0-1-bilingual-diagrams-plan.md`
