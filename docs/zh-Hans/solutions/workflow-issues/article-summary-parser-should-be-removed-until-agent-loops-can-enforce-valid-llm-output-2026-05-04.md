---
title: 在 agent loop 能保证 LLM 输出有效之前，应移除 article summary parser
date: 2026-05-04
category: workflow-issues
module: article summary
problem_type: workflow_gap
component: parser
severity: medium
applies_when:
  - reviewing `ArticleSummaryParser`
  - 决定 `invalid_summary_payload` 是否应该触发重试或重新向 LLM 追问
  - 规划 article summary 的 LLM 输出校验策略
tags: [article-summary, llm, parser, validation, agent-loop, workflow]
---

# 在 agent loop 能保证 LLM 输出有效之前，应移除 article summary parser

## Problem

`apps/api/src/article-summary/article-summary.parser.ts` 会在 LLM 生成后校验 payload 结构，并在不符合 schema 时返回 `invalid_summary_payload`。但当前 `ArticleSummaryService` 会把这个失败当成终态错误处理：它会变成 `LLM_BAD_RESPONSE`，被持久化为 failure，而且不会触发重试，也不会再调用一次 LLM。换句话说，这个 parser 现在只是在做“拒绝”，没有参与“恢复”。

## Symptoms

- parser 能告诉我们输出格式不对，但不能让模型重新生成更好的答案。
- `invalid_summary_payload` 会被转成终态失败，而不是进入修正循环。
- 系统已经付出了 prompt 执行成本，最后却因为一个必填字段缺失或格式不对把结果丢掉。
- 当前行为看起来像在“控制输出”，但并没有真的提升输出稳定性。

## Why This Feels Redundant

当前流水线没有 agent loop，没有纠错式 reprompt，也没有结构化 repair 步骤。因此：

- 校验发生在生成之后，而不是 recovery 过程里
- parser 的失败不会反馈给 LLM
- 可观察到的唯一结果只是一个终态 bad-response code

这让 parser 更像一个薄薄的 post-check，而不是有价值的 orchestration 原语。如果产品短期内不打算做修复 prompt 或更严格的 agent loop，那这个 parser 并没有带来足够的结果改善，不值得保留在主路径里。

## Solution

把 parser 当成临时基础设施，在摘要流水线具备“主动修复 malformed output”的能力之前，把它从 hot path 里移除。

推荐方向：

- 从当前执行路径中删除 `ArticleSummaryParser`
- 让 gateway 或 service 只返回原始 LLM payload，或者只在明显的 transport-level 问题上快速失败
- 在重新引入结构化校验之前，先实现 agent loop 或等价的修复流程
- 如果之后还要做校验，也要把它放进一个能真正让模型修正并重试的循环里

## Why This Works

这样系统会更诚实地表达它当前能做什么。

- 只能拒绝输出的 parser，不会提升生成质量。
- 没有修复策略的重试，只会重复同一个错误答案。
- agent loop 可以把 validation 变成 feedback，这时 schema 校验才真正有价值。

在这个 loop 存在之前，parser 只会增加复杂度，不会带来恢复能力。

## Prevention

- 不要把 schema validator 留在 hot path 里，除非它能影响下一次生成。
- 要把“验证 shape”和“从 shape failure 中恢复”分开。
- 如果预期会出现 malformed LLM output，应该先定义纠错循环，再加 validation 反馈。
- 比起一个只会产出终态失败的 validator，更应该相信原始 payload 观察和显式修复流程。

## Related Context

- `apps/api/src/article-summary/article-summary.parser.ts`
- `apps/api/src/article-summary/article-summary.service.ts`
- `apps/api/src/article-summary/article-summary.service.spec.ts`
- `docs/en/solutions/integration-issues/article-summary-prompt-language-contract-2026-05-04.md`
- `docs/zh-Hans/solutions/integration-issues/article-summary-prompt-language-contract-2026-05-04.md`
- `docs/en/solutions/logic-errors/article-summary-retryable-failures-must-not-clear-existing-summary-2026-04-18.md`
- `docs/zh-Hans/solutions/logic-errors/article-summary-retryable-failures-must-not-clear-existing-summary-2026-04-18.md`
