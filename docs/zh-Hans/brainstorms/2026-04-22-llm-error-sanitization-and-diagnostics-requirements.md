---
date: 2026-04-22
topic: llm-error-sanitization-and-diagnostics
---

# LLM 错误脱敏与可诊断反馈需求

## Problem Frame

当前仓库存在一条已经验证的错误泄漏链：`apps/api/src/article-summary/article-summary.gateway.ts` 会直接读取上游 provider / gateway 的 `error.message`，`apps/api/src/article-summary/article-summary.repository.ts` 会把该值持久化到 `summaryErrorReason`，`apps/api/src/articles/articles.service.ts` 会把它返回给 Web，`apps/web/src/widgets/article-reader/ui/article-detail.tsx` 则会直接渲染给用户。

这意味着只要上游报错文本里包含 API key、Bearer token、header 片段、代理配置或其他敏感诊断内容，当前系统就可能把敏感信息同时泄漏到数据库、后端日志与前端界面。这个风险已经超出“文案不友好”层面，属于需要立即收口的安全与运维边界问题。

本次需求采用方案 3：不在前端做补丁式遮罩，也不只在 API 出口重写文案；而是在错误源头建立稳定、安全的错误契约，把 raw provider error 留在应用边界之外。前端只消费可复制、可支持排障、但不会泄漏 secrets 的安全错误信息；后端日志则保留足够的结构化诊断上下文，用于开发和运维排查。

已验证的当前状态：

- `apps/api/src/article-summary/article-summary.gateway.ts` 通过 `getErrorReason()` 原样返回 `error.message`。
- `apps/api/src/article-summary/article-summary.service.ts` 会把失败 `reason` 写入结构化日志，但当前日志内容本身仍可能包含上游原始敏感文本。
- `apps/api/src/article-summary/article-summary.repository.ts` 会把失败 `reason` 持久化到 `Article.summaryErrorReason`，并清空 `summary` 与 `translatedTitle`。
- `apps/api/src/articles/article.repository.ts` / `apps/api/src/articles/articles.service.ts` / `apps/api/src/articles/dto/article-detail-item.dto.ts` 继续把 `summaryErrorReason` 暴露给读取接口。
- `apps/web/src/widgets/article-reader/api/articles-api.ts` 与 `apps/web/src/widgets/article-reader/ui/article-detail.tsx` 已经把 `summaryErrorReason` 当成面向用户的展示文案。

## Design Steps

### Step 1: Capabilities

1. 系统必须阻止上游 LLM provider / gateway 的原始错误文本进入用户可见界面。
2. 系统必须阻止上游原始错误文本被持久化到可长期存储的业务字段。
3. 系统必须为用户提供一段安全、稳定、可复制粘贴的错误反馈，足以支持自助排查或向维护者反馈。
4. 系统必须为后端保留更好的结构化日志，让开发与运维能够判断错误类别、重试性、触发上下文与受影响对象。
5. 系统必须让错误语义稳定化，避免前端、数据库与日志各自依赖 provider 自由文本。
6. 系统必须保持现有 fail-open 产品方向：摘要失败不应破坏文章读取主链路。

### Step 2: Components

- `LLM Error Normalizer`：位于上游 LLM 调用边界，把 provider / gateway 原始错误收敛为稳定错误码、分类与安全用户消息。
- `Summary Failure Persistence Model`：负责定义哪些失败信息允许进入 `summaryErrorReason` 这类持久化业务字段，哪些只能停留在日志上下文。
- `Structured Diagnostic Logger`：负责记录 article、attempt、retryable、httpStatus、provider、errorCode 等排障所需字段，但避免记录可泄漏 secrets 的原始报错文本。
- `Article Read Contract`：负责把安全错误信息而不是 raw provider message 暴露给 Web 读取侧。
- `Frontend Error Presentation`：负责将安全错误信息展示成可复制的错误块，包含稳定错误码、简短说明与建议动作，而不是裸字符串。

### Step 3: Interactions

**Flow A — LLM 摘要调用失败**

1. `ArticleSummaryGateway` 调用外部 LLM provider / gateway。
2. 若上游失败，`LLM Error Normalizer` 读取异常对象中的可判定信号，例如 `status`、异常名称、错误类型或 SDK 已结构化字段。
3. Normalizer 产出统一失败结果：错误码、重试性、面向用户的安全消息、以及仅供日志使用的有限诊断元数据。
4. `ArticleSummaryService` 依据统一失败结果决定重试或终止，而不是再读取原始 `error.message`。

**Flow B — 失败持久化与日志**

1. 终态失败进入 `Summary Failure Persistence Model`。
2. 可持久化字段只保存稳定安全值，例如错误码或安全错误摘要，而不是 raw provider text。
3. `Structured Diagnostic Logger` 在日志中记录统一错误码、HTTP status、retryable、articleId、attempt、trigger 等字段。
4. 日志输出必须默认可用于检索、聚合与告警，而不是把 provider 自由文本拼接成不可控消息。

**Flow C — 前端读取与展示**

1. `Article Read Contract` 返回安全错误字段给 Web。
2. `Frontend Error Presentation` 把它渲染成固定错误块：人类可读标题、可复制的错误代码、简短解决建议。
3. 用户复制该错误块时，不会带出 API key、token、authorization header 或上游原始报文。

### Step 4: Contracts

**统一失败结果契约**

- 必须包含稳定错误码，例如 `LLM_AUTH_FAILED`、`LLM_RATE_LIMITED`、`LLM_TIMEOUT`、`LLM_CONNECTION_FAILED`、`LLM_BAD_RESPONSE`、`LLM_PROVIDER_FAILED`、`LLM_CONFIG_UNAVAILABLE`。
- 必须包含 `retryable` 语义，供摘要任务决定是否继续重试。
- 必须包含面向用户的安全消息，语言保持产品当前语言策略即可。
- 可以包含面向日志的受限诊断字段，例如 `httpStatus`、`providerKind`、`sdkErrorName`，但这些字段不应直接透传到前端文案。

**持久化契约**

- `summaryErrorReason` 不再承载 provider 原始文本。
- 第一版允许它承载稳定错误码，或“错误码 + 安全文案”的浅层安全值，但必须避免把它继续当 raw message 存储槽。
- 如果持久化契约不足以支持前端展示，可在 planning 阶段决定是否拆出更明确的安全错误字段；本次 brainstorm 先锁定“不可持久化 raw provider text”这条边界。

**前端展示契约**

- 前端错误展示必须由结构化字段驱动，而不是假设拿到一段可直接显示的 provider 文本。
- 错误块至少包含：用户可见标题、稳定错误码、简短说明、建议动作。
- 用户复制内容时，必须得到对支持排障有用、但不含 secrets 的文本，例如 `LLM_AUTH_FAILED | article=<id>` 这类安全片段。

## Requirements

**安全边界**

- R1. 系统不得把来自外部 LLM provider / gateway 的原始错误文本直接暴露给前端用户。
- R2. 系统不得把来自外部 LLM provider / gateway 的原始错误文本持久化到 `Article.summaryErrorReason` 或其他业务读取字段。
- R3. 系统不得把可能包含 secrets 的原始 provider 报错拼接进常规应用日志。
- R4. 任何包含 API key、token、authorization header、签名片段或供应商请求细节的错误内容，都必须在进入业务契约前被拦截或舍弃。

**错误契约**

- R5. LLM 摘要失败必须在调用边界被归一化为稳定错误码，而不是继续依赖 provider 自由文本。
- R6. 归一化结果必须明确表达错误是否可重试。
- R7. 第一版错误码集合必须覆盖最常见用户排障场景：认证失败、限流、超时、连接失败、响应格式错误、配置缺失、未知上游失败。
- R8. 前后端必须共享同一套稳定错误语义，避免后端写一种值、前端再猜另一层意思。

**日志与可观测性**

- R9. 后端必须输出结构化日志，而不是只输出拼接字符串形式的失败原因。
- R10. LLM 相关失败日志至少应包含：`scope`、`status`、`errorCode`、`retryable`、`articleId`、`attempt`、`trigger`；如果可安全获得，也应包含 `httpStatus` 与上游类别信息。
- R11. 日志设计必须优先支持检索、聚合与后续告警，而不是复刻用户可见文案。
- R12. 第一版不要求引入完整 jobs console 或运营后台；日志仍是主要诊断面。

**前端反馈**

- R13. 前端必须把摘要失败展示为固定、安全、可复制的错误块，而不是裸露的后端字符串。
- R14. 错误块必须让用户知道“出了什么类错误”以及“下一步该检查什么”，但不需要暴露 provider 内部实现细节。
- R15. 错误块的可复制内容必须稳定、简洁，便于贴给维护者、记录 issue 或自助检查配置。
- R16. 前端在展示失败时仍必须维持现有摘要阅读器的可理解状态，不因为错误展示而破坏文章详情整体布局。

**范围与演进**

- R17. 本次修复至少覆盖已确认泄漏链 `article-summary -> article read API -> web detail pane`。
- R18. 本次修复应形成可复用模式，使其他 LLM 或外部集成错误链路后续能沿用相同边界。
- R19. 本次修复不要求一次性清理仓库所有 `error.message` 使用点，但新的契约不应鼓励继续复制这种模式。
- R20. 本次修复必须保持摘要任务现有 retry / fail-open 行为，不把安全修复变成产品行为回归。

## Success Criteria

- 触发任意上游 LLM 认证失败或网关失败时，前端不再显示 provider 原始报错文本。
- `summaryErrorReason` 不再存储 raw provider message，而只存安全值。
- 后端日志能让开发者区分 `LLM_AUTH_FAILED`、`LLM_RATE_LIMITED`、`LLM_TIMEOUT` 等主要失败类型，并关联到具体 `articleId` 与尝试次数。
- 用户在前端看到的错误信息可以直接复制粘贴给维护者，但复制结果不包含 secrets。
- 现有文章读取和摘要失败 fail-open 语义保持成立，没有因为安全收口而破坏阅读主路径。

## Scope Boundaries

- 本次不重做整套全局异常系统。
- 本次不引入用户可见的 jobs dashboard、错误历史中心或运维后台。
- 本次不要求一次性整改 `feeds`、`article-content` 等所有模块里的 raw `error.message` 使用点。
- 本次不要求引入 provider-specific adapter 层；仍保持当前薄 OpenAI-compatible 调用边界。
- 本次不要求暴露更深的 provider request / response 明细给前端。

## Key Decisions

- 方案选型：采用“源头归一化 + 结构化日志 + 前端安全错误块”，而不是前端 mask 或 API 出口补丁。
- 安全优先级：provider 原始错误文本默认视为不可信输入，不进入业务持久化和用户界面。
- 错误码优先：产品与排障都围绕稳定错误码展开，而不是围绕供应商自由文本展开。
- 日志分层：日志保留诊断价值，但不承担 secrets 转储职责。
- 前端目标：给用户足够可复制的排障信息，而不是“看起来详细”的原始错误。

## Dependencies / Assumptions

- `apps/api/src/article-summary/article-summary.gateway.ts` 仍是当前最合适的错误归一化入口，因为它已处于外部 LLM 调用边界。
- `summaryErrorReason` 当前已被 Web 读取链路消费，因此无论最终沿用此字段还是演进为新字段，都需要维持读取侧契约可迁移。
- 上游 SDK 或异常对象至少能提供一部分可判定信号，例如 `status`、`name`、`type` 或其他结构化属性；若缺失，则第一版允许回退到通用 `LLM_PROVIDER_FAILED`。

## Outstanding Questions

### Deferred to Planning

- [Affects R2, R13, R15][Technical] `summaryErrorReason` 第一版究竟只存错误码，还是存一个更结构化的安全展示对象？
- [Affects R10, R11][Technical] 日志里是否需要单独增加 request correlation id，还是先复用现有日志上下文即可？
- [Affects R18, R19][Needs research] 是否要在本次落地里顺手抽出一个可复用的通用 external-error normalization helper，还是先只服务 `article-summary`。

## Next Steps

- 先确认这份 requirements / design 文档，再进入 `/ce:plan` 或 `/ce:work`。
