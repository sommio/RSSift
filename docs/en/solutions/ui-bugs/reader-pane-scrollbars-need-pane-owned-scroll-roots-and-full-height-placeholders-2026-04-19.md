---
title: Reader pane scrollbars need pane-owned scroll roots and full-height placeholders
date: 2026-04-19
category: ui-bugs
module: article reader
problem_type: ui_bug
component: react_component
symptoms:
  - the desktop reader could fall back toward page-level scrolling instead of keeping the article list and detail panes independently scrollable
  - the left pane depended on a fragile `sm:h-full` height chain, while the right pane still used native `overflow-auto`, so scrollbar behavior was asymmetric and hard to discover
  - after the detail pane moved into the shared scroll wrapper, empty and unavailable states could lose vertical centering unless the placeholder path also kept a full-height flex chain
root_cause: scope_issue
resolution_type: code_fix
severity: medium
related_components:
  - next_page
  - testing_framework
tags:
  [
    article-reader,
    dual-pane,
    scroll-area,
    scrollbar,
    overflow,
    placeholder-state,
    flex-height-chain,
  ]
---

# Reader pane scrollbars need pane-owned scroll roots and full-height placeholders

## Problem

The desktop reader is designed as a fixed-height dual-pane surface, but the original height and overflow chain let scrolling drift away from the panes themselves. The list pane depended on an ambient height assumption, the detail pane used native `overflow-auto`, and the later detail refactor showed that placeholder states also needed the same full-height contract as real article content.

## Symptoms

- On desktop, the page could become the effective scroll container instead of the list pane and detail pane owning scroll independently.
- The two panes did not share the same scrollbar contract, so the list pane and detail pane behaved differently under overflow.
- Empty or unavailable detail states risked sitting inside a scroll wrapper without enough height context to stay vertically centered.

## What Didn't Work

- Leaving the detail pane on native `overflow-auto` while the list pane used the shared `ScrollArea` kept behavior asymmetric and made scrollbar visibility depend on OS/browser defaults.
- Relying on `sm:h-full` inside the list pane did not create a reliable height chain in a fixed shell; it only worked when ancestor sizing happened to line up.
- Moving placeholder content under the new scroll wrapper without also restoring a `min-h-full` + `flex-1` chain would keep the scroll root but break the previous centered empty-state layout.

## Solution

Make the reader shell and both panes explicit about scroll ownership, then preserve the same height contract for placeholder states.

The shell now owns a fixed viewport boundary, and the shared primitive is a flex-owned scroll root with stable structural hooks:

```tsx
<main className="h-dvh min-h-dvh overflow-hidden ...">
  <section className="... h-[calc(100dvh-1rem-2px)] ... overflow-hidden ...">
    <ArticleList ... />
    <ArticleDetailPane ... />
  </section>
</main>
```

```tsx
const ScrollArea = React.forwardRef(
  ...({ className, children, type = "always", ...props }, ref) => (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      type={type}
      className={cn(
        "group/scroll-area relative flex min-h-0 flex-col overflow-hidden",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="min-h-0 w-full flex-1 rounded-[inherit]"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
    </ScrollAreaPrimitive.Root>
  ),
);
```

The detail pane now uses the same shared scroll root as the list pane, and placeholder states keep a full-height flex chain so centering survives the refactor:

```tsx
<ScrollArea data-testid="article-detail-scroll-area" className="min-h-0 flex-1">
  <div
    className={cn(
      "px-5 py-5 lg:px-7 lg:py-7 xl:px-8 xl:py-8",
      isPlaceholderState && "flex min-h-full flex-col",
    )}
  >
    <div
      className={cn(
        "mx-auto w-full max-w-5xl",
        isPlaceholderState && "flex min-h-full flex-1 flex-col",
      )}
    >
      {content}
    </div>
  </div>
</ScrollArea>
```

Verification was split across SSR and browser tests:

- `apps/web/app/page.spec.tsx` asserts the fixed shell classes, the two scroll roots, and the placeholder-state full-height wrappers.
- `apps/web/e2e/home.spec.ts` proves `scrollHeight > clientHeight`, independent `scrollTop` changes for each pane, stable headers during pane scrolling, and preserved detail scroll roots for pending and unavailable states.

## Why This Works

The bug was not a single missing class; it was a broken ownership boundary. The shell is supposed to be a clipped reading surface, so the panes must own overflow explicitly. Once both panes use the same `ScrollArea` contract and their bodies opt into `min-h-0 flex-1`, the browser no longer needs to guess where scrolling belongs. The follow-up placeholder fix works for the same reason: empty and unavailable states now inherit the same full-height flex chain as the normal detail body, so layout does not collapse when content is replaced by a centered fallback.

## Prevention

- In fixed-height reader or dashboard layouts, keep headers outside the scroll body and make the pane body the explicit scroll root.
- Do not rely on `h-full` alone inside nested flex shells; preserve the full `overflow-hidden` -> `min-h-0` -> `flex-1` chain from shell to viewport to content wrapper.
- When moving empty, pending, or unavailable states under a shared scroll wrapper, preserve their full-height layout path and add assertions for the wrapper classes that centering depends on.
- Keep stable scroll-root selectors such as `data-testid="article-list-scroll-area"` and `data-slot="scroll-area-viewport"` so browser tests can verify real overflow behavior instead of only markup.

## Related Issues

- Paired implementation plans:
  - `docs/en/plans/2026-04-19-001-fix-reader-pane-scrollbars-plan.md`
  - `docs/zh-Hans/plans/2026-04-19-001-fix-reader-pane-scrollbars-plan.md`
- Related learning: `docs/en/solutions/logic-errors/article-summary-retryable-failures-must-not-clear-existing-summary-2026-04-18.md` — the reader should keep a stable visible structure even when summary content is pending or unavailable.
- GitHub issue search via `gh issue list --search "reader scrollbar article detail scroll" --state all --limit 5` returned no related issues.
