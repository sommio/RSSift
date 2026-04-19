---
title: fix: 恢复 reader 双栏的独立滚动条
type: fix
status: completed
date: 2026-04-19
origin:
  - docs/en/brainstorms/2026-04-18-v0-1-slice-4-llm-summary-reader-requirements.md
  - docs/zh-Hans/brainstorms/2026-04-18-v0-1-slice-4-llm-summary-reader-requirements.md
---

# fix: 恢复 reader 双栏的独立滚动条

## Overview

本计划用于修复 desktop reader shell 的一个可用性回归：左右两栏本应各自滚动并带有可发现的滚动条，但当前高度/overflow 链路让左栏滚动高度脆弱、右栏又退回到更像页面原生滚动的行为。改动收口在 `apps/web` 与共享的 `ScrollArea` primitive 内，保持现有 URL 驱动的阅读流，并补上针对真实 overflow 行为的浏览器回归覆盖。

## Problem Frame

用户反馈与截图都表明，当前双栏 reader 缺少可发现的栏内滚动条，但产品合同仍然是 desktop-first、dual-pane（见 origin: `docs/en/brainstorms/2026-04-18-v0-1-slice-4-llm-summary-reader-requirements.md`）。影响本次修复的仓库现状如下：

- `apps/web/src/widgets/article-reader/ui/article-reader-shell.tsx` 已经把外层 shell 定义成固定高度并带 `overflow-hidden`，所以滚动所有权应落在 pane 内部，而不是页面本身。
- `apps/web/src/widgets/article-reader/ui/article-list.tsx` 虽然已经使用 `ScrollArea`，但它依赖 `sm:h-full`，而不是显式由 flex 接管的 scroll body，因此高度链路很容易失效。
- `apps/web/src/widgets/article-reader/ui/article-detail.tsx` 仍使用原生 `overflow-auto`，导致左右两栏滚动策略不对称，也无法保证和左栏一致的可见滚动条表面。
- `packages/ui/src/components/scroll-area.tsx` 目前只被 reader list 使用，因此收紧它的可见性/契约，blast radius 很小。
- `apps/web/app/page.spec.tsx` 与 `apps/web/e2e/home.spec.ts` 目前只证明了渲染与导航，还没有证明真实 overflow 或双栏独立滚动。

## Requirements Trace

- R1. 在 desktop 下，左侧文章栏与右侧摘要栏都必须在 reader shell 内部各自拥有纵向滚动；页面本身不能成为主要滚动容器。
- R2. 当内容溢出时，两栏都必须暴露可发现的纵向滚动条，而不是依赖操作系统层面可能隐藏的原生滚动条行为。
- R3. 两栏 header 保持固定，真正滚动的是各自的 body。
- R4. URL 驱动的选择、empty/unavailable state，以及当前只读 API 合同都保持不变。
- R5. 保留 origin requirements 里的 desktop-first dual-pane 体验；不把这次修复扩张成移动端改造或布局重写。
- R6. 增加能证明双栏独立滚动的回归覆盖，并使用真实 overflow 内容验证。

## Scope Boundaries

- 不重做文章卡片、Markdown 排版或整体视觉刷新。
- 不改 API 合同、取数方式或路由。
- 不做任何移动端专项适配，只要求当前行为不被破坏。
- 除非实施中发现无法局部消化的重复，否则不新增 reader 专属共享布局抽象。
- 不引入新的浏览器滚动条 polyfill，继续只使用现有 Radix `ScrollArea` primitive。

## Context & Research

### Relevant Code and Patterns

- `apps/web/src/widgets/article-reader/ui/article-reader-shell.tsx` 已经建立了固定高度的 shell 边界，并通过 `overflow-hidden` 阻止整页滚动兜底。
- `apps/web/src/widgets/article-reader/ui/article-list.tsx` 展示了当前左栏 `ScrollArea` 的用法，以及脆弱的 `sm:h-full` 高度假设。
- `apps/web/src/widgets/article-reader/ui/article-detail.tsx` 已经拆成 header + body，但 body 仍然使用原生 `overflow-auto`，而不是共享滚动条 primitive。
- `packages/ui/src/components/scroll-area.tsx` 是当前共享滚动条 primitive，并且现在只在 reader list 中使用。
- `apps/web/app/page.spec.tsx` 覆盖了服务端渲染结构与 fallback state。
- `apps/web/e2e/home.spec.ts` 覆盖了浏览器级导航，但还没有断言 overflow 或双栏独立滚动。

### Institutional Learnings

- `docs/en/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md` 与 `docs/zh-Hans/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md` 已经明确：长标题与长摘要必须通过滚动保持可读，而不是把双栏布局压坏。
- `docs/en/brainstorms/2026-04-18-v0-1-slice-4-llm-summary-reader-requirements.md` 及其中译配对文档继续把 desktop dual-pane reader 视为主 UX，因此这次回归修复应当强化该合同，而不是改写它。

### External References

- 无。当前仓库对 reader shell、共享 `ScrollArea`、以及 Playwright/Jest 覆盖都已经有足够强的本地模式，无需额外外部调研。

## Key Technical Decisions

- 保持滚动所有权在 reader 两栏内部，而不是让页面级滚动重新兜底；这与当前 fixed-shell 设计一致。
- 让两栏 body 都收敛到共享的 `ScrollArea` 契约上，避免滚动条是否可见继续依赖原生操作系统滚动条设置。
- 在 flex 链路里显式表达滚动区域（pane shell 用 `overflow-hidden`，pane body 用 `min-h-0 flex-1`），而不是继续依赖 `h-full` 去“猜”高度。
- 把修复收口在 reader widget 与共享 primitive 内，不引入新布局抽象，也不改 route/client-state。
- 增加浏览器级 overflow 断言，因为 SSR markup test 本身无法证明真实独立滚动。

## Open Questions

### Resolved During Planning

- **是不是把整页滚动重新放开就能解决？** 不是。shell 已经定义成固定高度阅读面，滚动应属于 pane，而不是页面。
- **右栏还继续保留原生 `overflow-auto` 吗？** 不保留。左右两栏都要走同一套 `ScrollArea` 契约，才能保证滚动条可见性和行为一致。
- **需要额外做一个 reader 专属的 shared wrapper 吗？** 不需要。`packages/ui/src/components/scroll-area.tsx` 已经是正确的抽象面；额外 hook 只保留最小必需量。

### Deferred to Implementation

- 如果布局修复后滚动条 thumb/track 对比度仍然太弱，具体色值可在 implementation 里通过截图校验再做微调。
- Playwright 最终使用 `data-testid`、`aria-label` 还是其他稳定 hook 来定位 pane scroll root，可在 implementation 看到最终 DOM 形状后再定。

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

- [x] **Unit 1: 在 shell 边界收紧共享滚动契约**

**Goal:** 先在 shell 级别建立稳定的滚动契约，让 pane shell 能正确裁剪，且共享 `ScrollArea` 能作为明确的 scroll root 使用。

**Requirements:** R1, R2, R3, R5

**Dependencies:** None

**Files:**

- Modify: `packages/ui/src/components/scroll-area.tsx`
- Modify: `apps/web/src/widgets/article-reader/ui/article-reader-shell.tsx`
- Test: `apps/web/app/page.spec.tsx`

**Approach:**

- 收紧 `ScrollArea`，让它可以在 reader 里充当明确 scroll root，而不是继续依赖环境高度碰巧对齐。
- 保持外层 reader shell 继续是固定高度边界，并确保它仍然拒绝页面级 overflow 兜底。
- 只暴露 pane 组件接入 `min-h-0 flex-1` scroll body 所需的最小 class 级灵活性，不顺手扩张 primitive 能力面。

**Patterns to follow:**

- `packages/ui/src/components/scroll-area.tsx`
- `apps/web/src/widgets/article-reader/ui/article-reader-shell.tsx`
- `apps/web/app/page.spec.tsx`

**Test scenarios:**

- Happy path — 服务端渲染出的 shell 继续保持固定高度 reader 边界，而不是重新把页面级 overflow 当主滚动所有权。
- Happy path — 共享 `ScrollArea` 在 reader shell 内仍然会渲染 viewport 与 scrollbar 结构。
- Edge case — 当没有选中文章或没有任何文章时，shell 结构仍然有效。
- Integration — 收紧 shell 契约后，不改变现有 `articleId` 导航 markup 与 detail 渲染 seam。

**Verification:**

- 共享 primitive 已经能在固定高度 flex shell 里承载可见滚动条，reader 不再依赖“页面碰巧能滚”来暴露 overflow。

- [x] **Unit 2: 让左右两栏都切到同一套 fixed-header + scroll-body 模式**

**Goal:** 让文章列表栏与摘要详情栏都保持固定 chrome，而内容部分各自独立滚动。

**Requirements:** R1, R2, R3, R4, R6

**Dependencies:** Unit 1

**Files:**

- Modify: `apps/web/src/widgets/article-reader/ui/article-list.tsx`
- Modify: `apps/web/src/widgets/article-reader/ui/article-detail.tsx`
- Test: `apps/web/app/page.spec.tsx`

**Approach:**

- 去掉左栏对 `sm:h-full` 的依赖，改成显式由 flex 接管的 scroll body。
- 右栏接入同一套共享滚动条 primitive 与 padding 模式，同时保留现有 Markdown 渲染与 fallback state。
- 不改变 list card、标题展示或 detail 内容语义；本单元只统一滚动所有权与滚动条可见性。

**Patterns to follow:**

- `apps/web/src/widgets/article-reader/ui/article-list.tsx`
- `apps/web/src/widgets/article-reader/ui/article-detail.tsx`
- `docs/en/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md`

**Test scenarios:**

- Happy path — reader markup 明确暴露一个 list scroll body 和一个 detail scroll body。
- Happy path — list 与 detail 的 header 都位于各自 scroll body 之外，因此滚动时保持固定。
- Edge case — empty、unavailable、pending、error 四类 detail state 都继续保留 detail scroll body，且高度正确。
- Integration — 长列表内容与长摘要内容都继续待在各自 pane 内，而不是把 shell 高度整体撑开。

**Verification:**

- 左右两栏在代码层面已经共享同一套高度/overflow 契约，内容增长时不再回退到页面级滚动。

- [x] **Unit 3: 增加双栏独立滚动的浏览器回归覆盖**

**Goal:** 让未来一旦出现“某一栏不能滚”“页面滚动回来了”或“某栏滚动条又消失”的回归时，测试能直接拦住。

**Requirements:** R4, R6

**Dependencies:** Unit 1, Unit 2

**Files:**

- Modify: `apps/web/e2e/home.spec.ts`
- Modify: `apps/web/app/page.spec.tsx`
- Test: `apps/web/e2e/home.spec.ts`

**Approach:**

- 给 list 与 detail scroll root 增加稳定 selector，并把浏览器覆盖扩展到这两个滚动容器。
- 使用确定性的长内容 fixture 或 seed 数据，断言 `scrollHeight > clientHeight`，并验证两个 pane 的 `scrollTop` 能各自独立变化。
- SSR/spec 覆盖只负责结构 hook；真实滚动能力由 Playwright 证明。

**Execution note:** 实施 agent 必须使用 `agent-browser` skill 做变更后的浏览器级验证，并截图证明左栏滚动条与右栏滚动条都独立存在；同时要通过实际滚动操作确认每一栏滚动时自己的 header 保持固定。

**Patterns to follow:**

- `apps/web/e2e/home.spec.ts`
- `apps/web/app/page.spec.tsx`
- `apps/web/README.md`

**Test scenarios:**

- Happy path — desktop 下 list scroll root 与 detail scroll root 都存在，并且都发生纵向 overflow。
- Happy path — 滚动 list pane 只改变 list 的滚动位置；滚动 detail pane 只改变 detail 的滚动位置。
- Edge case — 缺失文章 detail 时，list pane 仍然可滚，detail pane 结构仍然完整。
- Error path — summary pending 或 summary failed 状态不会把 detail scroll root 移除。
- Integration — 切换到另一篇文章并刷新后，detail 内容与双栏滚动结构都保持稳定。

**Verification:**

- 一旦应用退回页面级滚动，或者任一 pane 失去自己的 scroll root，浏览器覆盖就会失败。
- `agent-browser` 验证必须产出截图，证明修复后左右两栏都暴露独立滚动条。
- `agent-browser` 交互必须确认：滚动左栏不会带动右栏，滚动右栏不会带动左栏，且两栏都是 header 固定、body 滚动。

## System-Wide Impact

- **Interaction graph:** `apps/web/src/widgets/article-reader/ui/article-reader-shell.tsx` 定义高度边界；`apps/web/src/widgets/article-reader/ui/article-list.tsx` 与 `apps/web/src/widgets/article-reader/ui/article-detail.tsx` 消费该边界；`packages/ui/src/components/scroll-area.tsx` 提供共享滚动表面。
- **Error propagation:** 不改变任何 API 或数据错误语义；这里的失败表现为布局回归，而不是合同或持久化故障。
- **State lifecycle risks:** empty、unavailable、pending、error 等 detail 状态切换时，必须保持同一套 scroll-root 结构，避免状态变化悄悄把高度链路弄坏。
- **API surface parity:** 无。`apps/web/src/widgets/article-reader/api/articles-api.ts` 与 API payload shape 都保持不变。
- **Integration coverage:** 只有浏览器测试才能证明真实 overflow、双栏独立滚动位置、以及页面级滚动兜底没有回归。
- **Unchanged invariants:** URL 驱动的 `articleId` 选择、服务端取数页面、Markdown 摘要渲染、以及外跳的 `Jump to original` 行为都保持不变。

## Risks & Dependencies

| Risk                                                                 | Mitigation                                                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 右栏滚动条在布局修复后仍然显得过于隐蔽。                             | 把调优局限在 `packages/ui/src/components/scroll-area.tsx`，并在 implementation 阶段结合截图/浏览器检查验证。 |
| 如果 fixture 内容不够长，滚动断言可能变得脆弱。                      | 使用确定性的长内容 fixture 或 seed 数据，并同时断言 overflow 指标与 scroll position 变化。                   |
| 收紧 pane overflow class 可能意外裁掉 fallback state 或 focus ring。 | 保持 padding 在 scroll viewport 内，并把 empty、unavailable、pending、error 状态都纳入回归场景。             |

## Documentation / Operational Notes

- 本次修复不改变 API 文档、环境文档或 rollout 说明。
- 如果 implementation 为 pane scroll root 增加稳定测试 hook，应把它们限制在 reader 组件内，不扩张成仓库级测试约定变更。

## Sources & References

- **Origin documents:** `docs/en/brainstorms/2026-04-18-v0-1-slice-4-llm-summary-reader-requirements.md` + `docs/zh-Hans/brainstorms/2026-04-18-v0-1-slice-4-llm-summary-reader-requirements.md`
- Related plans: `docs/en/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md`, `docs/zh-Hans/plans/2026-04-10-001-feat-first-vertical-slice-read-path-plan.md`, `docs/en/plans/2026-04-18-001-feat-v0-1-llm-summary-reader-plan.md`, `docs/zh-Hans/plans/2026-04-18-001-feat-v0-1-llm-summary-reader-plan.md`
- Related code: `apps/web/src/widgets/article-reader/ui/article-reader-shell.tsx`, `apps/web/src/widgets/article-reader/ui/article-list.tsx`, `apps/web/src/widgets/article-reader/ui/article-detail.tsx`, `packages/ui/src/components/scroll-area.tsx`, `apps/web/app/page.spec.tsx`, `apps/web/e2e/home.spec.ts`
