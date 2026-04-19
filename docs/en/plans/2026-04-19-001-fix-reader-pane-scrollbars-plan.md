---
title: fix: restore independent scrollbars in the reader panes
type: fix
status: completed
date: 2026-04-19
origin:
  - docs/en/brainstorms/2026-04-18-v0-1-slice-4-llm-summary-reader-requirements.md
  - docs/zh-Hans/brainstorms/2026-04-18-v0-1-slice-4-llm-summary-reader-requirements.md
---

# fix: restore independent scrollbars in the reader panes

## Overview

This plan fixes a regression in the desktop reader shell: both panes should scroll independently with visible scrollbars, but the current height/overflow chain leaves the list pane fragile and the detail pane reliant on native page-style scrolling behavior. The change stays inside `apps/web` plus the shared `ScrollArea` primitive, preserves the current URL-driven read flow, and adds browser coverage for real overflow behavior.

## Problem Frame

The user report and screenshot show the current dual-pane reader lacks discoverable per-pane scrollbars, even though the product contract remains desktop-first and dual-pane (see origin: `docs/en/brainstorms/2026-04-18-v0-1-slice-4-llm-summary-reader-requirements.md`). Current repo facts that shape the fix:

- `apps/web/src/widgets/article-reader/ui/article-reader-shell.tsx` already defines a fixed-height shell with `overflow-hidden`, so scroll ownership should live inside the panes rather than on the page.
- `apps/web/src/widgets/article-reader/ui/article-list.tsx` already uses `ScrollArea`, but it relies on `sm:h-full` instead of an explicit flex-owned scroll body, which makes the height chain easy to break.
- `apps/web/src/widgets/article-reader/ui/article-detail.tsx` still uses native `overflow-auto`, which keeps the two panes asymmetric and does not guarantee a visible scrollbar surface consistent with the left pane.
- `packages/ui/src/components/scroll-area.tsx` is only used by the reader list today, so tightening its visibility/contract has low blast radius.
- `apps/web/app/page.spec.tsx` and `apps/web/e2e/home.spec.ts` currently prove rendering and navigation, but they do not yet prove real overflow or independent pane scrolling.

## Requirements Trace

- R1. On desktop, the left article rail and right summary pane each own vertical scrolling inside the reader shell; the page itself is not the primary scroll container.
- R2. When content overflows, both panes expose a discoverable vertical scrollbar rather than relying on OS-level hidden native-scrollbar behavior.
- R3. Pane headers stay fixed while pane bodies scroll.
- R4. URL-driven selection, empty/unavailable states, and the current read-only API contract remain unchanged.
- R5. Preserve the desktop-first dual-pane experience from the origin requirements; do not turn this fix into a mobile redesign or a layout rewrite.
- R6. Add regression coverage that proves the independent-scroll behavior with real overflow content.

## Scope Boundaries

- No redesign of article cards, markdown typography, or general visual refresh.
- No API contract, data-loading, or route changes.
- No mobile-specific adaptation beyond keeping current behavior intact.
- No new shared layout abstraction unless implementation discovers duplication that cannot stay local to the reader widget.
- No browser-specific scrollbar polyfill beyond the existing Radix `ScrollArea` primitive.

## Context & Research

### Relevant Code and Patterns

- `apps/web/src/widgets/article-reader/ui/article-reader-shell.tsx` already establishes the fixed-height shell boundary with `overflow-hidden`.
- `apps/web/src/widgets/article-reader/ui/article-list.tsx` shows the current left-pane `ScrollArea` usage and the fragile `sm:h-full` height assumption.
- `apps/web/src/widgets/article-reader/ui/article-detail.tsx` already splits header and body, but the body uses native `overflow-auto` rather than the shared scrollbar primitive.
- `packages/ui/src/components/scroll-area.tsx` is the current shared scrollbar primitive and is only used by the reader list today.
- `apps/web/app/page.spec.tsx` covers server-rendered reader structure and fallback states.
- `apps/web/e2e/home.spec.ts` covers browser navigation but does not yet assert overflow or independent pane scrolling.

### Institutional Learnings

- `docs/en/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md` and `docs/zh-Hans/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md` already set the expectation that long titles and long summaries must remain readable through scrolling without collapsing the two-pane layout.
- `docs/en/brainstorms/2026-04-18-v0-1-slice-4-llm-summary-reader-requirements.md` and its Chinese pair keep the desktop dual-pane reader as the primary UX, so this regression fix should reinforce that contract rather than change it.

### External References

- None. The repo already has strong local patterns for the reader shell, the shared `ScrollArea`, and Playwright/Jest coverage.

## Key Technical Decisions

- Keep scroll ownership inside the reader panes rather than allowing page-level scrolling to paper over the bug; this matches the existing fixed-shell design.
- Standardize both pane bodies on the shared `ScrollArea` contract so visible scrollbar behavior no longer depends on native OS scrollbar settings.
- Make the scrollable region explicit in the flex chain (`overflow-hidden` on pane shells and `min-h-0 flex-1` on pane bodies) instead of relying on `h-full` to infer height.
- Keep the fix local to the reader widget and the shared primitive; avoid new layout abstractions or route/client-state changes.
- Add browser-level overflow assertions, because SSR markup tests alone cannot prove independent scroll behavior.

## Open Questions

### Resolved During Planning

- **Should this be solved by letting the whole page scroll again?** No. The shell already declares a fixed-height reading surface; the panes should own scrolling.
- **Should the detail pane keep native `overflow-auto`?** No. Use the same `ScrollArea` contract on both panes so scrollbar visibility and behavior stay consistent.
- **Does this require a new shared reader-specific wrapper component?** No. `packages/ui/src/components/scroll-area.tsx` is already the right abstraction surface; keep any extra class hooks minimal.

### Deferred to Implementation

- The exact scrollbar thumb/track contrast can be tuned during implementation if screenshot validation shows the current token values remain too subtle after the layout fix.
- Whether Playwright needs `data-testid`, `aria-label`, or another stable hook on the pane scroll roots can be decided during implementation once the final DOM shape is settled.

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce._

```text
ReaderShell (fixed-height, overflow-hidden)
├─ ArticleListPane (min-h-0 flex-col overflow-hidden)
│  ├─ Header (fixed)
│  └─ ScrollArea (flex-1 min-h-0) -> article cards
└─ ArticleDetailPane (min-h-0 flex-col overflow-hidden)
   ├─ Header (fixed)
   └─ ScrollArea (flex-1 min-h-0) -> title + markdown summary + fallback states
```

## Implementation Units

- [x] **Unit 1: Tighten the shared scroll contract at the shell boundary**

**Goal:** Give the reader a stable scroll contract at the shell level so pane shells clip correctly and the shared `ScrollArea` can serve as an explicit scroll root.

**Requirements:** R1, R2, R3, R5

**Dependencies:** None

**Files:**

- Modify: `packages/ui/src/components/scroll-area.tsx`
- Modify: `apps/web/src/widgets/article-reader/ui/article-reader-shell.tsx`
- Test: `apps/web/app/page.spec.tsx`

**Approach:**

- Tighten `ScrollArea` so it can act as the reader's explicit scroll root without depending on ambient height quirks.
- Keep the outer reader shell as the fixed-height boundary and ensure it continues to reject page-level overflow.
- Expose only the minimum class-level flexibility needed for the pane components to opt into `min-h-0 flex-1` scroll bodies.

**Patterns to follow:**

- `packages/ui/src/components/scroll-area.tsx`
- `apps/web/src/widgets/article-reader/ui/article-reader-shell.tsx`
- `apps/web/app/page.spec.tsx`

**Test scenarios:**

- Happy path — the server-rendered shell keeps a fixed-height reader boundary rather than reintroducing page-level overflow ownership.
- Happy path — the shared `ScrollArea` markup still renders a viewport plus scrollbar structure when used inside the reader shell.
- Edge case — the shell structure remains valid when there is no selected detail or no available articles.
- Integration — tightening the shell contract does not change the current `articleId` navigation markup or detail rendering seams.

**Verification:**

- The shared primitive can host a visible scrollbar inside a fixed-height flex shell, and the reader no longer depends on accidental page scrolling to reveal overflow.

- [x] **Unit 2: Move both reader panes onto the same fixed-header plus scroll-body pattern**

**Goal:** Ensure the article list and summary detail panes both keep fixed chrome while their content scrolls independently.

**Requirements:** R1, R2, R3, R4, R6

**Dependencies:** Unit 1

**Files:**

- Modify: `apps/web/src/widgets/article-reader/ui/article-list.tsx`
- Modify: `apps/web/src/widgets/article-reader/ui/article-detail.tsx`
- Test: `apps/web/app/page.spec.tsx`

**Approach:**

- Replace the left-pane `sm:h-full` reliance with an explicit flex-owned scroll body.
- Route the detail pane through the same shared scroll primitive and padding model while preserving the current Markdown rendering and fallback states.
- Keep list cards, title rendering, and detail content semantics unchanged; this unit only normalizes scroll ownership and scrollbar visibility.

**Patterns to follow:**

- `apps/web/src/widgets/article-reader/ui/article-list.tsx`
- `apps/web/src/widgets/article-reader/ui/article-detail.tsx`
- `docs/en/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md`

**Test scenarios:**

- Happy path — the reader markup exposes one scroll body for the article list and one scroll body for the detail pane.
- Happy path — list and detail headers remain outside their respective scroll bodies so they stay fixed during scrolling.
- Edge case — empty, unavailable, pending, and error detail states all keep the detail scroll body mounted and correctly sized.
- Integration — long list content and long summary content remain inside their own panes instead of stretching the shell height.

**Verification:**

- Both panes share the same height/overflow contract in code, and neither pane falls back to page-level scrolling when content grows.

- [x] **Unit 3: Add browser regressions for independent pane scrolling**

**Goal:** Catch future regressions where one pane stops scrolling, page scroll returns, or a pane loses its own scrollbar.

**Requirements:** R4, R6

**Dependencies:** Unit 1, Unit 2

**Files:**

- Modify: `apps/web/e2e/home.spec.ts`
- Modify: `apps/web/app/page.spec.tsx`
- Test: `apps/web/e2e/home.spec.ts`

**Approach:**

- Extend browser coverage with stable selectors for the list and detail scroll roots.
- Use deterministic long-content fixtures or seeded records to assert `scrollHeight > clientHeight` and verify each pane can change `scrollTop` independently.
- Keep SSR/spec coverage focused on structural hooks; leave real scrolling proof to Playwright.

**Execution note:** The implementing agent must use the `agent-browser` skill for post-change browser validation. Capture screenshots that show the left pane scrollbar and right pane scrollbar independently, and use browser interaction to verify that each pane scrolls while its header stays fixed.

**Patterns to follow:**

- `apps/web/e2e/home.spec.ts`
- `apps/web/app/page.spec.tsx`
- `apps/web/README.md`

**Test scenarios:**

- Happy path — on desktop, both the article list scroll root and the detail scroll root are present and vertically overflow.
- Happy path — scrolling the list pane changes only the list scroll position, and scrolling the detail pane changes only the detail scroll position.
- Edge case — a missing article detail still leaves the list pane scrollable and the detail pane structurally intact.
- Error path — a pending or failed summary state does not remove the detail scroll root.
- Integration — refreshing after selecting another article preserves the same detail content and the same dual-pane scroll structure.

**Verification:**

- Browser coverage fails if the app falls back to page-level scrolling or if either pane loses its own scroll root.
- `agent-browser` validation produces screenshots proving that both panes expose independent scrollbars after the fix.
- `agent-browser` interaction confirms that scrolling the left pane does not scroll the right pane, scrolling the right pane does not scroll the left pane, and both pane headers remain fixed while their bodies move.

## System-Wide Impact

- **Interaction graph:** `apps/web/src/widgets/article-reader/ui/article-reader-shell.tsx` defines the height boundary; `apps/web/src/widgets/article-reader/ui/article-list.tsx` and `apps/web/src/widgets/article-reader/ui/article-detail.tsx` consume that boundary; `packages/ui/src/components/scroll-area.tsx` provides the shared scroll surface.
- **Error propagation:** No API or data error semantics change; failures here manifest as layout regressions rather than contract or persistence failures.
- **State lifecycle risks:** Empty, unavailable, pending, and error detail states must keep the same scroll-root structure so state changes do not silently reintroduce broken height propagation.
- **API surface parity:** None. `apps/web/src/widgets/article-reader/api/articles-api.ts` and the API payload shape stay unchanged.
- **Integration coverage:** Only browser tests can prove real overflow, independent scroll positions, and the absence of page-level fallback scrolling.
- **Unchanged invariants:** URL-driven `articleId` selection, server-fetched page rendering, markdown summary rendering, and the external `Jump to original` action all stay as they are.

## Risks & Dependencies

| Risk                                                                                     | Mitigation                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| The right-pane scrollbar may still feel visually too subtle after the layout fix.        | Keep tuning localized to `packages/ui/src/components/scroll-area.tsx` and validate with screenshot/browser checks during implementation. |
| Scroll assertions can become flaky if the fixture content is not tall enough.            | Use deterministic long-content fixtures or seeded records and assert both overflow metrics and scroll-position changes.                  |
| Tightening pane overflow classes could accidentally clip fallback states or focus rings. | Keep padding inside the scroll viewport and include empty, unavailable, pending, and error states in the regression scenarios.           |

## Documentation / Operational Notes

- No API docs, environment docs, or rollout notes change for this fix.
- If implementation adds stable test hooks on the pane scroll roots, keep them local to the reader components and avoid repo-wide testing convention changes.

## Sources & References

- **Origin documents:** `docs/en/brainstorms/2026-04-18-v0-1-slice-4-llm-summary-reader-requirements.md` + `docs/zh-Hans/brainstorms/2026-04-18-v0-1-slice-4-llm-summary-reader-requirements.md`
- Related plans: `docs/en/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md`, `docs/zh-Hans/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md`, `docs/en/plans/2026-04-18-001-feat-v0-1-llm-summary-reader-plan.md`, `docs/zh-Hans/plans/2026-04-18-001-feat-v0-1-llm-summary-reader-plan.md`
- Related code: `apps/web/src/widgets/article-reader/ui/article-reader-shell.tsx`, `apps/web/src/widgets/article-reader/ui/article-list.tsx`, `apps/web/src/widgets/article-reader/ui/article-detail.tsx`, `packages/ui/src/components/scroll-area.tsx`, `apps/web/app/page.spec.tsx`, `apps/web/e2e/home.spec.ts`
