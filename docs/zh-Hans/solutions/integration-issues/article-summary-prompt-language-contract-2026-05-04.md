---
title: Article summary prompt 不会替换 `{lang}`，只受部署级语言配置驱动
date: 2026-05-04
category: integration-issues
module: article summary
problem_type: integration
component: llm_prompt
severity: medium
applies_when:
  - reviewing article summary prompt construction
  - 排查为什么 `ja` 或 `en-US` 没有变成 system prompt 里的语言占位符
  - 确认摘要输出是否受用户级语言设置控制
tags:
  [
    article-summary,
    llm,
    prompt,
    language,
    config,
    openai-compatible,
    integration,
  ]
---

# Article summary prompt 不会替换 `{lang}`，只受部署级语言配置驱动

## Problem

`apps/api/src/article-summary/article-summary.prompt.ts` 的 system prompt 里写了 `{lang}` 占位符，但这个文件内部并没有做插值替换。真正构造 prompt 的逻辑会把 `language` 字段传进去，而 `ArticleSummaryGateway` 使用的是 `config.llmSummary.language`。因此，运行时语言契约实际上是部署级的，不是用户级的，而 system prompt 文本本身仍然保留着字面量 `{lang}`。

## Symptoms

- 把 `LLM_SUMMARY_LANGUAGE` 改成 `ja` 或 `en-US` 只会影响配置值的传递，不会自动替换 system prompt 里的 `{lang}`。
- 当前流水线里没有按用户设置语言的入口，所以摘要输出不会跟单个读者偏好绑定。
- prompt 看起来像是支持语言注入，但 system message 里其实还留着未解析的占位符。

## What Did Not Work

- 以为 `{lang}` 会被 prompt helper 自动替换。
- 把 `LLM_SUMMARY_LANGUAGE` 当成用户级语言设置，而不是部署级设置。
- 指望后面的 `Language: ${input.language}` user message 顺便说明 system prompt 里的占位符也已经被解析。

## Solution

把 article summary 的语言契约明确成单一部署级配置：

- `LLM_SUMMARY_LANGUAGE` 提供整套部署的目标语言。
- `ArticleSummaryGateway` 把这个语言值传进 prompt 输入。
- prompt 文本要么显式插值语言，要么干脆不要再写 `{lang}`，改成直白描述。
- 如果产品未来真的需要按读者切语言，应该做成独立功能，不要把它藏在摘要流水线的隐式行为里。

## Why This Works

这样 runtime contract 会更诚实：

- config 负责目标语言
- prompt 负责措辞规则
- gateway 负责组装消息
- 读者不会在没有单独产品设置的情况下“隐式控制”摘要语言

这样就不会误以为 `ja` 或 `en-US` 被自动 normalize 或自动替换了；它们实际上只是被当成配置值向下传递。

## Prevention

- system prompt 里不要留下占位符，除非 builder 明确会替换它。
- 部署级语言配置和用户级偏好要分开建模。
- 补一条测试，检查组装出来的 messages，确认 system prompt 真的符合预期语言契约。

## Related Context

- `apps/api/src/article-summary/article-summary.prompt.ts`
- `apps/api/src/article-summary/article-summary.gateway.ts`
- `apps/api/src/config/app-config.ts`
- `apps/api/src/config/env.validation.ts`
- `docs/en/plans/2026-04-18-001-feat-v0-1-llm-summary-reader-plan.md`
- `docs/zh-Hans/plans/2026-04-18-001-feat-v0-1-llm-summary-reader-plan.md`
