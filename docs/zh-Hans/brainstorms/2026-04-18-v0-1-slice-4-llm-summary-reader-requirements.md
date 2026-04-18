---
date: 2026-04-18
topic: v0-1-slice-4-llm-summary-reader
---

# v0.1 Slice 4 LLM 摘要阅读器需求

## Problem Frame

`tmp/v0.1/v0.1.md` 已经把 v0.1 的产品定义成“摘要优先的 RSS 筛选器”，而不是传统 RSS 阅读器。当前真正的问题不只是订阅源里有大量英文内容，更是 feed 标题本身信息量不足，用户很难仅凭标题判断一篇文章是否值得继续投入阅读时间。

前一个切片已经建立了可持久化的文章 Markdown 正文。下一个切片应该把这层能力转成第一个真正的产品价值：只要一篇文章同时具备标题和提取后的正文 Markdown，系统就应在内部生成一个可直接消费的阅读摘要产物，让 Web 阅读器直接使用。这个切片要证明的主链路是 `feed -> 正文提取 -> 摘要生成 -> 双栏阅读 -> 跳转原文`，而不是继续暴露公开写接口，也不是等到用户打开文章时才临时生成摘要。

已验证的当前状态：

- `apps/api/prisma/models/article.prisma` 里的 `Article` 已经拥有 `contentMarkdown`、`contentExtractedAt` 和兼容字段 `summary`，但当前还没有单独持久化翻译标题的字段。
- `apps/api/src/articles/article.repository.ts` 与 `apps/api/src/articles/articles.service.ts` 已经在 `GET /articles/:id` 返回 `summary`。
- `apps/web/src/widgets/article-reader/ui/article-detail.tsx` 已经把详情页渲染成“摘要优先阅读视图”，并提供跳转原文按钮。
- `apps/api/src/article-content/article-content.controller.ts` 仍然暴露 `POST /article-content/:id/retry`，这和本切片希望保持公开产品面只读的方向相冲突，也会给后续带来不必要的安全暴露面。
- `apps/api/src/config/env.validation.ts` 与 `apps/api/src/config/app-config.ts` 当前还没有任何 LLM 网关相关配置，因此本切片需要把 LLM 集成边界定义得非常薄，避免把复杂网关能力带进产品需求。

## Requirements

**摘要产品行为**

- R1. 系统必须把 AI 摘要生成视为文章阅读的核心内部生产步骤，而不是在阅读时才触发的可选辅助能力。
- R2. 第一版 LLM 摘要输入必须把文章标题与提取后的 `contentMarkdown` 作为同一个语义单元一起处理。
- R3. 第一版持久化 AI 输出必须包含一套一起成功的结果：单独落库的目标语言标题，以及一个固定格式的阅读摘要，用来帮助用户判断是否要继续读原文；部署默认语言为 `zh-CN`，但后端必须保留单一目标语言配置入口。
- R4. 这个固定格式摘要必须在同一个 Markdown 字符串里包含三层信息：一个基于 `title + contentMarkdown` 联合生成的目标语言标题、一段简短的关键信息摘要，以及一个有序列表形式的核心要点。
- R5. 产品必须保持现有阅读心智：用户先看已准备好的摘要，再通过“跳转原文”进入更深阅读。

**LLM 网关与配置边界**

- R6. 第一版后端对外部 LLM 的依赖必须收敛为一个 OpenAI-compatible API 调用面，而不是引入 provider-specific 集成层。
- R7. 第一版后端配置必须保持最小集合：`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`、`LLM_SUMMARY_LANGUAGE`；其中语言默认值为 `zh-CN`。
- R8. 第一版可以额外保留一个薄配置项用于请求超时控制，但不能把 retry policy、fallback matrix、provider type 或复杂路由策略作为本切片必需配置。
- R9. 产品必须明确把上游网关错误处理视为外部依赖责任的一部分，而不是在本仓库内重建一套复杂错误编排系统。

**Prompt 契约与摘要结构**

- R10. 第一版必须使用一个全英文 system prompt 来约束摘要生成行为，避免把产品规则拆散到多处调用逻辑里。
- R11. 该 system prompt 必须明确要求模型只基于输入的 `title` 与 `contentMarkdown` 生成结果，不得补充外部事实，不得把推测写成确定陈述。
- R12. 该 system prompt 必须明确要求输出遵守分层阅读摘要结构：先给一个基于完整上下文生成的目标语言标题，再给一段短摘要，最后给一个有序列表形式的核心要点，且三层内容都落在同一个 Markdown 字符串中。
- R13. 第一版 system prompt 必须包含少量 few-shot 示例，用来稳定摘要层级、语气、长度与 Markdown 形状；few-shot 的目标是约束输出格式，而不是引入复杂 agent 行为。
- R14. system prompt 必须把语言要求写清楚：输出语言由调用时注入的 `{lang}` 占位符决定，而 `{lang}` 的运行时值来自 `LLM_SUMMARY_LANGUAGE`，而不是由文章原文语言或模型自行猜测。
- R15. system prompt 必须把失败时的保守策略写清楚：当正文信息不足、结构混乱或结论不确定时，允许输出保守摘要，但不得伪造缺失信息。
- R16. system prompt 必须明确说明 `## Title` 的语义是“原标题在 `{lang}` 下的翻译版本”，而不是重新起标题、摘要式标题或编辑改写标题。

**内部触发与持久化**

- R17. 摘要生成必须在文章正文提取成功后由系统内部触发，而不是通过公开 HTTP 写请求触发，也不是通过 UI 打开文章时触发。
- R18. 第一版需要处理两类文章：新完成 `contentMarkdown` 的文章，以及所有还没有完整摘要结果的旧文章。
- R19. 第一版必须为 `Article` 增加一个单独字段来持久化翻译后的标题，而不是把它仅仅埋在 `summary` Markdown 里再反向解析。
- R20. 生成出的 Markdown 摘要在第一版必须持久化到现有 `Article.summary` 字段。
- R21. `translatedTitle` 与 `summary` 必须作为一套完整结果一起成功才允许写库；不能接受只写其中一个字段的半套结果。
- R22. 同一篇文章后续再次生成成功时，必须直接覆盖旧的 `translatedTitle` 与 `summary`，第一版不保留版本历史。
- R23. 已持久化摘要必须可被后续阅读直接复用；系统不能要求每次打开详情页都重新调用一次 LLM。
- R24. 摘要生成失败必须 fail-open：即使高质量 AI 摘要暂时不可用，文章也仍然可以继续存在并被读取。

**公开表面与 UX 契约**

- R25. 本切片的公开产品表面必须保持只读导向：用户应通过现有文章读取路径获得准备好的摘要，而不是通过公开摘要生成接口触发它。
- R26. 本切片必须删除当前公开 repair 风格写入口 `POST /article-content/:id/retry`，而不是保留它或做软废弃。
- R27. 删除 `POST /article-content/:id/retry` 是产品与安全要求的一部分：本切片不能留下一个会扩大后续安全负担的非必要公开写入口。
- R28. 文章列表与详情页都必须优先显示持久化后的翻译标题；如果 `translatedTitle` 为空，则回退显示原始 `title`。
- R29. `GET /articles/:id` 必须继续返回摘要阅读器主产物给 Web 阅读器直接消费；如果需要额外暴露翻译标题，也应作为读取结果的一部分而不是通过重新解析 `summary` 获得。
- R30. 摘要阅读体验必须继续保持桌面优先、双栏布局。

**降级与可靠性**

- R31. 如果正文提取本身不可用，本切片不要求对该文章强制保证完整 AI 摘要。
- R32. 对 OpenAI-compatible 网关的暂时性错误，第一版必须做隐式重试 3 次，每次间隔 1 分钟；重试范围只包含 timeout、`429` 和 `5xx` 这类明显暂时性错误。
- R33. 如果最终仍然失败，系统不得写入 `translatedTitle` 或 `summary`；失败后的持久化状态应该保持为空，便于后续错误处理。
- R34. 结构化输出解析采用半严格策略：应允许 heading 在大小写或少量空格上有小变体，但仍必须稳定识别 `Title`、`Summary`、`Key Points` 三段。
- R35. 如果 `Title` 段缺失、无法识别，或整体三段结构无法被半严格解析，整次摘要生成都应判失败，而不是部分落库。
- R36. `Key Points` 的条目数只是软约束，不是硬失败条件；只要三段结构存在，就不因条目数偏离 3-5 条而判失败。
- R37. 第一版不要求额外的 edge-case 修补逻辑、机械摘要回退或局部修复策略；失败时只走最简单路径。
- R38. 第一版不要求在应用层做复杂错误 taxonomy、provider-specific 错误映射或多级 fallback 编排；只需要识别“成功 / 失败 / 超时”这类最小结果边界即可。
- R39. 第一版可以把可观测性主要保持在日志和自动化测试中；本切片不要求用户可见的 jobs console、队列面板或摘要历史模型。

## Success Criteria

- 新文章或新完成正文 enrichment 的文章，以及旧的缺失文章，能够在不依赖阅读时触发的情况下，从已持久化的标题与 `contentMarkdown` 进入完整摘要结果的持久化状态，并支持通过单一后端语言配置决定输出语言。
- 摘要生成所使用的 system prompt 能够稳定地产出“标题 + 摘要 + 要点”的分层阅读结构，而不是每篇文章都漂移成不同写法。
- 完整摘要结果必须满足：`translatedTitle` 非空、`summary` 非空，并且 `summary` 能被半严格解析为 `Title / Summary / Key Points`。
- 文章列表与详情页都优先读取持久化后的翻译标题，并在缺失时正确回退到原始标题。
- 文章详情页继续读取 `Article.summary`，并且这个字段开始承担“摘要阅读器主产物”的语义，而不是旧的 feed 兼容摘要语义。
- 用户可以直接扫描右侧阅读栏里的准备好摘要，并决定是否点击进入原文。
- 公开 API 表面继续保持只读产品心智，并且现有 `POST /article-content/:id/retry` 路由被移除。
- 摘要生成失败不会破坏 feed 入库、文章持久化或文章读取；网关异常不会迫使本应用暴露额外的公开恢复接口。
- 当最终生成失败导致 `summary` 为空时，详情页以固定文案“上游服务错误”作为最小呈现，而不是增加复杂边缘处理逻辑。

## Scope Boundaries

- 本切片不做移动端适配。
- 本切片不做键盘快捷键或更高级的阅读效率功能。
- 本切片不做 digest、timeline 或批量 briefing 产品；这里只做单篇文章摘要阅读。
- 本切片不做用户可见的“重新生成摘要”操作。
- 本切片不做按用户切换的多语言输出变体；`LLM_SUMMARY_LANGUAGE` 只是部署级单一目标语言配置，不是产品内语言选择器。
- 本切片不做独立 `ArticleSummary` 表、摘要版本历史或 prompt-version 跟踪模型。
- 本切片暂不要求通过公开 API 暴露 `contentMarkdown` 本身。
- 本切片不做多 gateway 支持矩阵、provider-specific adapter 抽象层、复杂 retry/fallback 配置中心或用户可见错误运营面板。
- 本切片不做长链式 prompt orchestration、多角色 prompt、工具调用式 prompt，或用户可编辑 prompt 模板中心。
- 本切片不把摘要主产物扩展成复杂嵌套 schema、深层 JSON 协议或面向外部客户端的结构化输出契约；即便实现里采用结构化输出辅助，也必须保持浅层结构。
- 本切片不做“谁成功写谁”的半套持久化，也不做为了 edge case 增加的额外补救代码。

## Key Decisions

- 摘要优先，而不是阅读时触发：产品是摘要阅读器，因此在可能的情况下，摘要应该在阅读发生前就已准备好。
- 标题与正文是一份 LLM 输入包：v0.1 不应该把“标题翻译”和“正文摘要”拆成两个独立产品概念。
- 第一版的完整持久化产物是一对字段：单独存放的翻译标题字段，加上 `Article.summary` 里的固定 Markdown 摘要字符串。
- 外部 LLM 只通过一个 OpenAI-compatible 网关入口接入：第一版不为不同 provider 设计独立产品概念或集成抽象层。
- Prompt 也是产品契约的一部分：它必须稳定定义标题、摘要层级、语言、语气与保守性，而不是把这些规则隐含在代码里。
- 即便后续实现采用 structured output 思路，第一版也只允许使用浅层三段式结构，例如 `title`、`summary`、`keyPoints` 这类扁平字段；不能把摘要产物扩成复杂嵌套对象。
- 标题虽然需要结合 `title + contentMarkdown` 一起推断，但它的产品语义仍是“原标题在目标语言下的翻译版本”，不是重新起标题。
- 持久化必须原子化：`translatedTitle` 与 `summary` 要么一起成功写入，要么一起不写。
- 公开读取契约继续保持很薄：用户侧仍然通过现有读取 API 消费结果，而摘要生成留在内部；现有公开 retry POST 路由应删除而不是保留。
- Markdown 就是输出契约：摘要产物应该已经是适合 Web 阅读器展示的形状，而不是等下游 UI 再去重新拼接。

## 外部最佳实践信号

- `RSSNext/Folo` 把 AI 摘要当作内部产品能力，并把摘要结果持久化复用，而不是让阅读体验依赖每次临时触发的摘要请求。
- `RSSNext/Folo` 也会使用可读化后的更丰富正文内容，而不只是 feed metadata，这强化了“摘要要吃正文”的产品价值。
- `WCY-dt/MrRSS` 展示了一个更接近服务端持久化的模式：把生成后的摘要写回文章记录，这与本仓库复用 `Article.summary` 的方向一致。
- `BerriAI/litellm`、`Portkey-AI/gateway` 与 `QuantumNous/new-api` 这类主流 gateway 的共同模式是：网关负责把上游错误标准化为稳定的 OpenAI-compatible 响应，并把 retry、fallback、guardrails 等作为可选高级能力，而不是要求业务产品自己重建整套错误系统。
- 这些 gateway 给出的最强信号不是“应用层应该增加更多错误编排”，而是“业务产品应消费一个统一的 OpenAI-compatible 接口，并把复杂容错尽量留在外部网关”。
- `567-labs/instructor`、`pydantic/pydantic-ai` 与 `BoundaryML/baml` 这类高 star structured output 项目给出的共同信号是：小产品更适合稳定、浅层的输出结构；prompt 负责任务语气与保守性，schema 或解析逻辑只负责维持边界清晰和可校验性。
- 这些 structured output 实践不支持把简单摘要产品直接扩成复杂深层 JSON。对本切片更合理的做法是：产品主产物继续保持人类可读的 Markdown 三段式，如果实现层需要增强稳定性，可以在内部使用浅层结构辅助校验或提取。
- 综合这些产品的信号，本切片最合理的边界是：摘要输出应该是可复用的阅读产物，而不是面向外部编排暴露的公开写资源；应用层错误处理只需要维持最小 fail-open 能力。

## Dependencies / Assumptions

- 本切片假设前一切片建立的文章 Markdown 提取链路可用，并且至少能为一部分文章继续提供 `contentMarkdown`。
- 本切片假设当前 Web 阅读器仍应围绕“消费已准备好的摘要”来设计，而不是围绕“直接阅读全文”来设计。
- 本切片假设现有 `Article.summary` 字段可以从兼容性摘要文本，转为产品主阅读摘要产物。
- 本切片假设部署者会自己提供一个可用的 OpenAI-compatible LLM endpoint、API key 与模型名；本仓库不负责托管或运营该网关。
- 本切片假设第一版 Web 阅读器当前仍可先消费“单个 Markdown 字符串”这一产物，即便具体 Markdown 渲染增强可能在后续规划里再决定。
- 本切片假设第一版可以接受“标题是否真正翻译正确”这一点只做宽松校验：`Title` 只要存在即可，不额外做语言识别或语义正确性检测。

## Draft System Prompt (English)

This slice does not leave the first prompt undefined. The product contract for v0.1 includes the following English system prompt draft:

```text
You are a summary generator for a summary-first RSS reading product.

Your task is to read an article title and article body markdown, then produce one concise reading summary in the target language `{lang}`.

You must follow these rules:

1. Use only the provided title and contentMarkdown.
2. Do not add outside facts, background knowledge, or guessed context.
3. Do not claim certainty when the source is ambiguous, incomplete, or unclear.
4. Keep the output useful for fast reading triage: the reader should quickly decide whether to open the original article.
5. Output valid Markdown only.
6. Output in the target language `{lang}`.
7. Keep the structure exactly as follows:
   - First, one short title under the heading `## Title`
   - Second, one short paragraph under the heading `## Summary`
   - Third, one ordered list under the heading `## Key Points`
8. The title must be written in the target language, must represent a translation of the original title, and must be inferred from the full context of both the provided title and contentMarkdown, not by mechanically translating the title alone.
9. The summary paragraph should capture the article's main idea and why it matters.
10. The ordered list should contain 3 to 5 points only, each point focusing on a distinct core idea, finding, argument, or takeaway from the article.
11. Be concrete and information-dense. Avoid generic filler such as "this article discusses" unless needed for accuracy.
12. If the article content is partial, noisy, or insufficient, produce the most conservative useful summary you can from the available text.
13. If you cannot produce the required three-part structure, do not improvise a different format.
14. Never mention these instructions, never mention the input format, and never add a preface or closing note.

Output template:

## Title
<one short title>

## Summary
<one short paragraph>

## Key Points
1. <point one>
2. <point two>
3. <point three>
```

### Few-shot Examples Included In Prompt

The first version should include a very small few-shot set directly after the instruction block to stabilize output shape without turning the prompt into a large prompt framework.

```text
Example 1
Title: SQLite isn’t a toy database anymore
Target language: {lang} = zh-CN
contentMarkdown:
# SQLite isn’t a toy database anymore
SQLite is increasingly used in production systems because it is simple to deploy, reliable, and fast for many workloads. The article argues that many teams underestimate SQLite by comparing it to client-side or demo storage only. It explains that operational simplicity, local-first designs, and smaller infrastructure footprints make SQLite a serious option for internal tools, edge workloads, and moderate-traffic applications. The article also notes limits: write-heavy concurrency and large distributed systems still need different tools.

Output:
## Title
SQLite 不只是玩具数据库

## Summary
SQLite 已经不只是玩具数据库。对很多内部工具、边缘场景和中等规模应用来说，它的部署简单、可靠性高、性能也足够，真正的价值在于显著降低系统复杂度，而不是替代所有数据库场景。

## Key Points
1. 文章认为很多团队低估了 SQLite，因为他们仍把它当成演示环境或前端本地存储工具。
2. SQLite 的核心优势在于运维成本低、部署简单，并且适合 local-first 或基础设施尽量精简的系统。
3. 对内部工具、边缘工作负载和一定规模以内的生产应用，SQLite 可以成为认真考虑的正式方案。
4. 文章也明确指出边界：高写入并发和大型分布式系统通常仍需要其他数据库方案。

Example 2
Title: Why browser performance regresses slowly
Target language: {lang} = zh-CN
contentMarkdown:
# Why browser performance regresses slowly
The article argues that browser performance problems often emerge through many individually reasonable changes rather than a single catastrophic regression. Teams add abstractions, analytics hooks, UI layers, and safety checks over time. Each change appears acceptable in isolation, but the cumulative effect raises scripting cost, layout work, and memory use. The article recommends using budgets, repeated measurement, and periodic simplification work instead of treating performance as a one-time fix.

Output:
## Title
浏览器性能为何总是慢慢变差

## Summary
浏览器性能变差往往不是因为一次明显事故，而是许多看起来合理的小改动长期叠加的结果。文章强调，真正有效的做法不是一次性优化，而是持续测量、设定预算并定期做减法。

## Key Points
1. 作者认为性能退化通常是渐进式的，是抽象层、埋点、UI 逻辑和保护性代码不断累积后的结果。
2. 单个改动往往都能自圆其说，但整体叠加后会增加脚本执行、布局计算和内存开销。
3. 文章反对把性能治理当成一次性修复任务，而是主张持续监控和反复校准。
4. 更可持续的方法包括设定性能预算、重复测量，以及定期清理不再必要的复杂性。
```

This prompt draft is intentionally strict and small. It fixes structure, language control, and anti-hallucination behavior in the brainstorm itself instead of leaving them implicit for planning.

## Outstanding Questions

### Deferred to Planning

- [Affects R17, R18, R24][Technical] `contentMarkdown` 落库之后，究竟由哪个内部触发点负责摘要生成最合适？
- [Affects R4, R20, R29][Technical] 当前 Web 阅读器是否需要在本切片里同时支持 Markdown 渲染，还是第一版可以先把包含标题、摘要与要点的固定 Markdown 当纯文本渲染，等契约稳定后再升级？

## Next Steps

- 先确认这份 requirements 文档，再决定是否进入 `/ce:plan`。
