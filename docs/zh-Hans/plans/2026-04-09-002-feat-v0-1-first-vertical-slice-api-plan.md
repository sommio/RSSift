---
title: feat: 定义 v0.1 内第一个垂直切片 API
type: feat
status: completed
date: 2026-04-09
origin:
  - docs/zh-Hans/diagrams/v0.1-diagrams.md
  - docs/en/diagrams/v0.1-diagrams.md
  - tmp/v0.1/v0.1.md
  - docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md
  - docs/en/api-designs/v0.1-first-vertical-slice-api.md
---

# feat: 定义 v0.1 内第一个垂直切片 API

## 概览

这份 plan 只定义 `rss-start v0.1` 内第一个垂直切片的 API 设计，不进入代码实现。目标是把“桌面端双栏阅读器如何读取准备好的阅读材料”收敛成一组最小、稳定、可实现的读路径接口合同，让后续实现与前端对接都不需要重新发明 API 形状。

## 问题背景

当前产品文档已经明确了 v0.1 的核心语义：系统先从 `config.opml` 读取订阅源、拉取 feed、准备阅读材料，然后桌面端双栏界面消费这些准备好的材料，帮助用户决定是否打开原文链接。

这次 planning 的目标不是决定“怎么写 NestJS 模块”或“怎么存数据库”，而是先决定 API 应该长什么样。对第一个垂直切片来说，最重要的是把外部合同压到最小：

- 前端只读，不操作后台流程；
- 标题保持原文，不做翻译；
- 摘要可以是简单的非 LLM 结果；
- 列表和详情都能支持跳转原文；
- 不把内部状态、失败路径和后台动作暴露给前端。

## 需求追踪

- R1. API 必须只暴露读路径，不暴露刷新、重试、摘要生成、feed 管理等操作型端点。
- R2. API 必须覆盖双栏阅读器的最小读取闭环：左栏文章列表、右栏文章详情。
- R3. 列表响应必须返回 `id`、`title`、`sourceTitle`、`publishedAt`、`originalUrl`。
- R4. 详情响应必须返回 `title`、`sourceTitle`、`publishedAt`、`summary`、`originalUrl`。
- R5. v0.1 内第一个垂直切片不设计标题翻译、摘要状态、失败降级字段、分页筛选或多种摘要层级。
- R6. API 设计必须保持与 `docs/zh-Hans/diagrams/v0.1-diagrams.md` 和 `docs/en/diagrams/v0.1-diagrams.md` 的产品语义一致：前端读取的是“已准备好的阅读项”。

## 范围边界

- 不设计 `POST /articles/:id/summary/generate`、`POST /feeds/:id/refresh` 等操作端点。
- 不设计 feed CRUD、OPML 导入导出、已读/收藏、认证、多用户。
- 不设计 LLM 接口、prompt 结构、摘要算法细节。
- 不设计数据库 schema、任务队列、定时调度、缓存策略。
- 不把内部抓取失败、正文缺失、摘要失败编码为对外合同字段。

## 背景与调研

### 相关产品与仓库上下文

- `docs/zh-Hans/diagrams/v0.1-diagrams.md` 与 `docs/en/diagrams/v0.1-diagrams.md` 已经把 v0.1 收敛为“准备阅读材料 -> 双栏阅读 -> 按需跳转原文”的产品模型。
- `tmp/v0.1/v0.1.md` 是更早的源概念文档，其中曾包含标题翻译和更复杂的摘要设想；本轮设计已经明确收缩范围。
- 当前仓库的 `apps/api` 与 `apps/web` 仍是骨架，因此这次 plan 不依赖既有业务 API 模式，而是为第一条业务 API 合同定边界。

### 制度化经验

- `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md` 与英文对应文档提醒：一旦产品语义已澄清，后续计划必须显式继承，不要重新引入旧假设。
- 对这次 API 设计最重要的继承点是：系统先准备材料、打开原文是外部跳转动作、双栏阅读器只消费准备好的数据。

### 外部参考

- 无额外外部 API 规范被引入。本轮以当前产品语义与范围控制为主，不做框架层实现设计。

## 关键技术决策

- 对外只定义两个读取接口：`GET /articles` 与 `GET /articles/:id`。这样正好覆盖双栏界面的最小读取需求，也避免前端感知后台流程控制。
- 列表接口同样返回 `originalUrl`。这是已确认的产品要求：用户既可以从左栏直接跳转原文，也可以先点进右栏看摘要再跳转。
- 详情接口保持极简，不增加 `summaryStatus`、`contentAvailable`、`excerpt` 等预留字段。第一个切片要解决的是“能不能读”，不是“能不能解释为什么暂时读不到”。
- API 把摘要视为已经准备好的字段，而不是需要显式触发的资源。这样可以保持产品语义统一：前端面对的是阅读材料，而不是生成任务。
- 标题不翻译，摘要允许使用简单非 LLM 方案。这个决定同时控制了 API 的字段范围和后端复杂度。

## 开放问题

### 在 planning 阶段已解决

- API 是否只做读路径？是。
- 列表是否需要 `originalUrl`？需要。
- 详情是否保留极简字段集？保留。
- 标题是否翻译？不翻译。
- 摘要是否必须由 LLM 生成？不必须。

### 延后到实现阶段

- `id` 的最终编码形式是什么，例如 UUID、哈希或内部主键映射。
- `publishedAt` 的最终时间格式细节，例如 ISO 8601 的具体约束。
- `summary` 在正文缺失时的内部生成策略。
- 服务端内部如何从 `config.opml` 触发首轮数据准备，以及后续如何刷新。

## 高层技术设计

> *这一节用于表达 API 设计方向，供评审确认接口边界，不是实现规范。后续执行者应把它视为合同草图，而不是代码模板。*

### API Surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/articles` | 返回左栏文章列表所需的最小字段 |
| `GET` | `/articles/:id` | 返回右栏单篇文章详情所需的最小字段 |

### Contract Sketch

**1. `GET /articles`**

用途：
- 为左栏提供可扫读的文章列表
- 支持用户直接跳转原文
- 不承担详情展示、状态回传或后台控制职责

响应草图：

```json
[
  {
    "id": "article_001",
    "title": "Example article title",
    "sourceTitle": "Example Feed",
    "publishedAt": "2026-04-09T08:00:00Z",
    "originalUrl": "https://example.com/article-1"
  }
]
```

字段说明：
- `id`: 前端后续请求详情用的稳定标识
- `title`: 原始文章标题，不翻译
- `sourceTitle`: 该文章所属 feed/source 的可显示名称
- `publishedAt`: 文章发布时间
- `originalUrl`: 原文链接，可直接跳转

**2. `GET /articles/:id`**

用途：
- 为右栏提供单篇文章的最小判断材料
- 支持用户在详情视图里阅读摘要后决定是否跳转原文
- 不返回后台状态、生成过程或额外操作入口

响应草图：

```json
{
  "title": "Example article title",
  "sourceTitle": "Example Feed",
  "publishedAt": "2026-04-09T08:00:00Z",
  "summary": "This is a short deterministic summary prepared by the server.",
  "originalUrl": "https://example.com/article-1"
}
```

字段说明：
- `title`: 原始文章标题，不翻译
- `sourceTitle`: 所属 feed/source 名称
- `publishedAt`: 文章发布时间
- `summary`: 服务端准备好的简要摘要
- `originalUrl`: 原文链接

### 明确不进入合同的内容

以下内容即使实现时存在，也不进入 v0.1 内第一个垂直切片的对外 API：

- `summaryStatus`
- `contentAvailable`
- `excerpt`
- `translation`
- `regenerateSummaryAction`
- `refreshFeedAction`
- 失败原因与重试建议
- `POST /articles/:id/summary/generate`
- `POST /feeds/:id/refresh`

## 实施单元

- [x] **Unit 1: 锁定对外 API surface**

**Goal:** 明确第一个垂直切片只对外提供两条读路径接口，不让范围滑向后台控制 API。

**Requirements:** R1, R2, R6

**Dependencies:** None

**Files:**
- Modify: `docs/zh-Hans/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`
- Modify: `docs/en/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`

**Approach:**
- 把 API surface 固定为 `/articles` 与 `/articles/:id`。
- 明确列出本切片不开放的操作型端点与后台状态字段。

**Patterns to follow:**
- 与 `docs/zh-Hans/diagrams/v0.1-diagrams.md`、`docs/en/diagrams/v0.1-diagrams.md` 的产品表达保持一致。

**Test scenarios:**
- Test expectation: none -- 本单元只收敛 API 设计边界，不涉及运行时行为。

**Verification:**
- 任何阅读该计划的人都能明确知道：这一轮 API 只有两条读取端点，没有第三类控制端点。

- [x] **Unit 2: 锁定列表与详情合同**

**Goal:** 让双栏 UI 所需的字段集合在 planning 阶段就固定下来。

**Requirements:** R2, R3, R4, R5

**Dependencies:** Unit 1

**Files:**
- Modify: `docs/zh-Hans/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`
- Modify: `docs/en/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`

**Approach:**
- 列表只承载“扫读 + 跳转”最小字段。
- 详情只承载“判断 + 跳转”最小字段。
- 不在合同中预留未来状态字段，避免前端与实现范围膨胀。

**Patterns to follow:**
- 保持字段命名在中英文文档中语义同步。

**Test scenarios:**
- Test expectation: none -- 本单元定义接口合同而非实现测试计划。

**Verification:**
- 实现者和前端协作者不需要再讨论“列表是否要带 URL”“详情是否要带状态字段”这类基础合同问题。

- [x] **Unit 3: 锁定非目标与后续留白**

**Goal:** 把哪些内容不属于第一个垂直切片 API 写清楚，防止设计阶段后续再长出复杂字段。

**Requirements:** R1, R5, R6

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `docs/zh-Hans/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`
- Modify: `docs/en/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`

**Approach:**
- 显式列出“不进入合同”的字段和动作。
- 把实现层问题继续留在 implementation 阶段，而不是在 API 设计阶段伪装成合同需求。

**Patterns to follow:**
- 延续仓库的双语 durable docs 同步规则。

**Test scenarios:**
- Test expectation: none -- 本单元做的是范围控制，不是测试设计。

**Verification:**
- 后续进入 `/ce:work` 前，团队已经对“本切片 API 不解决什么”达成书面共识。

## 系统级影响

- **Interaction graph:** 本次设计只定义 Web UI 与 API 之间的读取面，不定义后台内部模块边界。
- **Error propagation:** 对外只保留正常读取语义；内部抓取与摘要失败如何传播，当前不属于 API 合同。
- **API surface parity:** 后续无论是前端 data fetching 层还是共享类型，都应以这两条接口合同为对齐源。
- **Unchanged invariants:** `config.opml` 仍是订阅源输入语义；双栏阅读器仍然消费“准备好的阅读材料”；打开原文仍然是外部跳转动作。

## 风险与依赖

| Risk | Mitigation |
|------|------------|
| 设计阶段就预留过多未来字段，导致首个切片失焦 | 坚持极简列表合同与极简详情合同 |
| 把内部失败处理暴露成对外状态机 | 明确禁止把状态、失败原因、控制动作写入当前合同 |
| 把 API 设计和实现设计混在一起 | 当前 plan 只回答“API 长什么样”，不回答“代码怎么写” |
| 中英文 API 文档语义漂移 | 继续把这对计划文档作为同步维护的双语文档 |

## 文档 / 维护说明

- 如果后续继续深化，应优先新增 requirements 或 implementation plan，而不是直接污染当前 API 合同。
- 若未来决定扩张 API surface，例如加入分页或刷新接口，应在新的 brainstorm / plan 中显式提出，而不是直接修改当前切片语义。
- 中英文文档必须同步维护。

## Sources & References

- 交付物：`docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md` 与 `docs/en/api-designs/v0.1-first-vertical-slice-api.md`。
- Product docs: `docs/zh-Hans/diagrams/v0.1-diagrams.md`, `docs/en/diagrams/v0.1-diagrams.md`
- Source concept: `tmp/v0.1/v0.1.md`
- Institutional learning: `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`, `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`
