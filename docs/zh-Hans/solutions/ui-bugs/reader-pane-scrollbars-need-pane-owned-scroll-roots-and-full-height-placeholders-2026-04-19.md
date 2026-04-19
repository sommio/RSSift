---
title: Reader 栏内滚动条修复需要栏内 scroll root 与占位态全高链路
date: 2026-04-19
category: ui-bugs
module: article reader
problem_type: ui_bug
component: react_component
symptoms:
  - desktop reader 可能退回到更像页面级滚动，而不是让文章列表栏与详情栏各自独立滚动
  - 左栏依赖脆弱的 `sm:h-full` 高度链路，右栏仍使用原生 `overflow-auto`，导致滚动条行为不对称且不易被发现
  - detail pane 接入共享 scroll wrapper 之后，如果占位态路径没有继续保持全高 flex 链路，empty 或 unavailable 状态就可能失去垂直居中
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

# Reader 栏内滚动条修复需要栏内 scroll root 与占位态全高链路

## Problem

desktop reader 的设计本来是固定高度的双栏阅读面，但最初的高度/overflow 链路让滚动所有权从栏内漂走了。左栏依赖环境高度碰巧成立，右栏继续走原生 `overflow-auto`，后续 detail refactor 又暴露出：占位态也必须继承和正文一样的全高布局契约，否则 reader 结构虽然还在，布局却会塌。

## Symptoms

- 在 desktop 上，页面本身可能重新变成主要滚动容器，而不是左右两栏各自拥有独立滚动。
- 左右两栏没有共享同一套滚动条契约，overflow 时行为不一致。
- 空态或 unavailable 的 detail 状态进入 scroll wrapper 后，如果没有足够的高度上下文，就可能失去原本的垂直居中。

## What Didn't Work

- 让右栏继续保留原生 `overflow-auto`，而左栏单独使用共享 `ScrollArea`，会让两栏行为持续不对称，也让滚动条可见性受 OS / 浏览器默认策略摆布。
- 在左栏里只保留 `sm:h-full`，并不能在 fixed shell 内建立稳定高度链路；它只是在祖先尺寸刚好对齐时“看起来能工作”。
- 把占位态内容搬进新的 scroll wrapper 却不补回 `min-h-full` + `flex-1` 链路，虽然 scroll root 还在，但之前的居中 empty-state 布局会悄悄丢失。

## Solution

把 reader shell 和两个 pane 的滚动所有权都显式化，再让占位态沿用同样的全高契约。

现在 shell 明确拥有固定视口边界，共享 primitive 也被收紧成 flex-owned scroll root，并暴露稳定的结构 hook：

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

detail pane 现在和左栏共用同一套 scroll root；同时，占位态继续保留全高 flex 链路，这样 refactor 后居中不会丢：

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

验证被拆成 SSR 与浏览器两层：

- `apps/web/app/page.spec.tsx` 断言 fixed shell class、两个 scroll root，以及占位态所依赖的全高 wrapper 结构。
- `apps/web/e2e/home.spec.ts` 证明 `scrollHeight > clientHeight`、左右两栏的 `scrollTop` 可以独立变化、pane 内滚动时 header 保持稳定，以及 pending / unavailable 状态下 detail scroll root 仍然存在。

## Why This Works

这个问题不是少了某一个 class，而是滚动所有权边界错了。shell 的职责是裁剪阅读面，所以 overflow 必须明确落在 pane 内部。一旦左右两栏都收敛到同一套 `ScrollArea` 契约，并让 body 显式进入 `min-h-0 flex-1` 链路，浏览器就不需要再“猜”到底该谁滚。后续的占位态修复也是同一原理：empty / unavailable 状态重新继承了和正常 detail body 一样的全高 flex 链路，所以内容被 fallback 替换时，布局不会塌。

## Prevention

- 在固定高度的 reader 或 dashboard 布局里，把 header 放在 scroll body 外面，并让 pane body 成为显式 scroll root。
- 不要在嵌套 flex shell 里只靠 `h-full`；要从 shell 到 viewport 到 content wrapper 一直保留 `overflow-hidden` -> `min-h-0` -> `flex-1` 这条高度链。
- 当 empty、pending、unavailable 状态被搬进共享 scroll wrapper 时，保留它们的全高布局路径，并为这些居中依赖的 wrapper class 加断言。
- 保留稳定的 scroll-root selector，比如 `data-testid="article-list-scroll-area"` 与 `data-slot="scroll-area-viewport"`，让浏览器测试可以验证真实 overflow 行为，而不只是看 markup。

## Related Issues

- 配对实现计划：
  - `docs/en/plans/2026-04-19-001-fix-reader-pane-scrollbars-plan.md`
  - `docs/zh-Hans/plans/2026-04-19-001-fix-reader-pane-scrollbars-plan.md`
- 相关 learning：`docs/zh-Hans/solutions/logic-errors/article-summary-retryable-failures-must-not-clear-existing-summary-2026-04-18.md` —— 即使 summary 处于 pending 或 unavailable，reader 也应该保持稳定、可见的结构。
- 通过 `gh issue list --search "reader scrollbar article detail scroll" --state all --limit 5` 检索后，没有找到相关 GitHub issue。
