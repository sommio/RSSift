---
title: Frontend Design Principles
date: 2026-04-10
status: active
scope:
  - apps/web
  - packages/ui
  - frontend-workflows
---

# Frontend Design Principles

This document is a shared set of frontend design principles for designers and agents.

It applies to frontend work across the monorepo, but its focus is not implementation detail or component API reference. Its job is to help humans and agents make better design decisions, collaborate with the same expectations, and evaluate frontend quality with the same lens.

This is a high-level principles document and does not replace `AGENTS.md`. `AGENTS.md` governs repository execution discipline, skill usage, and engineering constraints. This document governs design principles, design judgment, and visual acceptance standards.

Agents should not modify this document without explicit user approval.

## Design Priorities

By default, make tradeoffs in this order:

1. User tasks and usability
2. Product feel and aesthetic quality
3. Component system and consistency

All three matter, but the order matters too. Components, conventions, and reuse exist to support the experience, not to dominate it.

## Core Principles

### Start from the task, not the component

First answer what the user is here to do, then decide what the page should look like. Do not back into a page structure just because a component is convenient or a layout is familiar.

### One page should express one clear intention

A page can be rich, but its intention cannot be confused. Users should quickly understand whether they are here to read, choose, fill, compare, manage, or review something. Do not stack multiple competing narratives into the same first screen.

### Make the default state work first

Get the most common and most important default state right before expanding into empty, error, loading, and edge states. If the default state does not work, polished secondary states are just polished noise.

### Information hierarchy must feel stable

Titles, summaries, metadata, body content, and actions should form a clear and stable hierarchy. Users should be able to scan quickly and then settle naturally into deeper reading. Do not let every block compete for attention.

### Visual style should have taste, not theatrics

An interface can have character, but it should not rely on oversized headings, aggressive contrast, or performative decoration to prove it was designed. Good frontend design feels usable first and beautiful second.

### Prefer subtraction

Information, actions, decoration, and explanatory copy should all stay restrained. Every extra block needs a reason to exist. If it does not clearly help the user complete the current task, remove it.

### A strong local detail does not guarantee a strong whole

Do not focus only on a card, a button, or a single section. Frontend quality comes from overall rhythm, alignment, spacing, density, and contextual consistency. Local polish with a scattered whole is still weak design.

### Do not break basic user expectations without a reason

Especially in reading, input, and browsing flows, do not chase novelty by breaking basic expectations around layout, hierarchy, scrolling, click targets, or information order.

## Lightweight Guidance by Page Type

This document does not enforce a rigid taxonomy, but different page types do have different priorities.

### Reading / information consumption

Prioritize reading efficiency, rhythm, hierarchy, and sustained focus. The interface should support the content rather than compete with it.

### Tools / forms

Prioritize clarity, feedback, error tolerance, and completion flow. Do not make users guess the next step, and do not turn forms into presentation pieces.

### Lists / management

Prioritize scan efficiency, information density, and predictable actions. Do not turn every list item into an emotional card.

### Presentation / storytelling

Prioritize sequencing, visual rhythm, and brand expression. Even here, the page still needs a clear main thread instead of a long pile of blocks that only looks busy.

## Reading and Information Consumption Surfaces

A reader is not a landing page and not a magazine cover. It is first and foremost an interface that supports steady reading.

### Reading efficiency beats decoration

Titles, summaries, metadata, body content, and necessary actions should all be arranged around the reading task itself. Any additional expression should remain subordinate to that goal.

### Measure, line length, and whitespace should serve reading

The content column should feel comfortable to stay in, not just look impressive in a screenshot. On large screens, keep a stable and comfortable reading column instead of stretching endlessly across the viewport, but do not over-narrow it to the point that the layout feels weak or under-supported.

### Do not repeat the same information

The same title, summary, or metadata should not appear in multiple blocks. Avoid fake-value modules like “at a glance” if they only restate what the page already says while stealing room from the actual content.

### Hierarchy should stay restrained and stable

Reader titles should not behave like a marketing hero. Metadata should not fight the body. Action areas should not be louder than the content. The goal is to help users settle into reading, not to keep interrupting them with the interface.

### Preserve a centered reading feel on large screens

As the viewport grows, the reading area should keep a stable center axis and expand only within a reasonable upper bound. It should not stick to one side, but it should not float inside wasteful emptiness either.

### Do not make unnecessary decisions for the user

A reader should respect the user's existing reading habits. Do not casually override expectations around typography, reading flow, or information order unless the product goal clearly requires it.

## Anti-Patterns

These are common signals of weak frontend work and should be actively avoided.

### AI slop

It looks complete but has no clear intention; it has many blocks but little judgment; it feels assembled from templates instead of designed for a real product.

### Turning every page into a marketing page

Not every page needs a giant headline, slogan, or visual proclamation. Tools, readers, and management surfaces should be useful before they try to be impressive.

### Overdesigned title hierarchy

Titles that are too large, too heavy, or too frequent quickly destroy hierarchy, especially in readers and tool surfaces.

### Repetitive information blocks

If a block only repeats information the page already contains, it usually does not deserve to exist. Repetition wastes space and weakens the main content.

### Sacrificing experience for sameness

Consistency matters, but not at the cost of task clarity, context fit, and page quality.

### Looking at code instead of looking at the page

Frontend is not a text-only artifact. Reviewing JSX, CSS, or tokens alone is not enough to prove the design works. Frontend work without screenshot-based validation is not done.

## How Agents Should Work

### Understand the task, page type, and current phase first

Before implementing, decide whether this is a reading, input, management, or presentation surface, and whether the work is MVP delivery, usability correction, or visual refinement. Do not jump into implementation before the goal is aligned.

### Commit to one clear direction before piling on detail

Avoid trying multiple conflicting visual directions at once. Make the whole page work first, then refine rhythm, density, hierarchy, and local components.

### Frontend changes require screenshot-based validation

If a change affects layout, visual hierarchy, spacing, responsiveness, or perceived interaction quality, the agent must validate it with `agent-browser` screenshots.

### Iterate based on the screenshots

Screenshots are not just records. They are a design feedback loop. Agents should inspect them, identify what still feels off, crowded, weak, awkward, or misaligned, and keep refining until the result reaches an acceptable level of quality.

### Screenshot output location

Screenshots and related browser-validation artifacts should be stored under `.cache/agent-browser/`.

### Do not treat this principles document as disposable execution detail

This document exists to stabilize design judgment. Unless the user explicitly asks for it, agents should not rewrite it just to make a specific implementation easier.

## Relationship to `AGENTS.md`

- `AGENTS.md` governs execution discipline, skill order, architecture, and engineering constraints.
- `frontend-design.md` governs design principles, page judgment, and visual acceptance standards.
- If they overlap, follow the execution constraints in `AGENTS.md` while preserving the design intent in this document.

## Maintenance Principles

### Keep it short, focused, and usable

If a principle only works with a long chain of explanation, it probably does not belong here.

### Update principles before adding more rules

This document should help future judgment, not turn into a long and brittle rules warehouse.

### Keep Chinese and English in sync

`docs/zh-Hans/frontend-design.md` and `docs/en/frontend-design.md` must remain semantically synchronized. Updating one requires updating the other in the same change.
