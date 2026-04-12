---
title: feat: 定义 v0.1 双语产品图表文档
type: feat
status: completed
date: 2026-04-09
---

# feat: 定义 v0.1 双语产品图表文档

## 概览

这份 plan 面向 `tmp/v0.1/v0.1.md` 的纯文档交付：产出一份位于 `docs/zh-Hans/` 的中文图表文档和一份位于 `docs/en/` 的英文图表文档，并将它们作为一组长期同步维护的双语文档。目标是用一小组稳定的 Mermaid 图，澄清 v0.1 RSS MVP 的产品形态，聚焦核心用户价值，而不是实现细节。

## 问题背景

当前 v0.1 pitch 已经包含一些有价值的图表草案，但把产品流程和工程降级逻辑混在了一起。这一轮 planning 的目标更窄：只决定该画什么、按什么顺序画、以及双语文档该如何组织，让这些图能服务于产品/设计讨论。

源概念来自 `tmp/v0.1/v0.1.md` 中定义的 v0.1 RSS MVP：系统预处理抓取到的文章，根据用户配置生成目标语言标题与两层摘要，并以桌面端双栏阅读界面呈现。

## 需求追踪

- R1. 产出两份图表文档：中文位于 `docs/zh-Hans/`，英文位于 `docs/en/`。
- R2. 图表必须保持产品视角：重点表达用户路径、信息流和 MVP 边界，而不是工程失败处理。
- R3. 范围收敛到“解释清楚 MVP 所必需的图”，不额外扩张。
- R4. 中文和英文文档必须保持语义同步，描述同一个产品模型，并且在更新时成对修改。
- R5. 保留 MVP 的核心命题：用户先在列表中扫描配置语言标题，再打开某条内容查看预生成摘要，最后决定是否在新标签页打开原文链接。
- R6. 文档路径必须遵守仓库级双语文档规则：中文在 `docs/zh-Hans/*`，英文在 `docs/en/*`。

## 范围边界

- 不讨论后端、存储、调度或前端工程实现计划。
- 这一轮不画 edge case、重试、降级、fallback 图。
- 不扩展到移动端、auth、排序推荐、feed 高级管理等能力。
- 不在这一轮确定 prompt 设计、schema 设计或运行态状态机。

## 背景与调研

### 相关仓库结构与模式

- 仓库是一个 Turborepo monorepo，包含 `apps/`、`packages/`，此前没有现成的顶层 `docs/` 体系。
- 当前源材料位于 `tmp/v0.1/v0.1.md`，其中已经包含 3 张 Mermaid 草图和 breadboard/sketch 引用。
- 用户已明确把任务从“实现思考”收缩为“产品经理视角的图表规划”。
- 仓库级 `AGENTS.md` 已新增规则：所有 durable docs，包括 plan，都必须以中文和英文成对维护，分别位于 `docs/zh-Hans/*` 与 `docs/en/*`。

### 制度化经验

- 当前仓库中没有与此主题相关的 `docs/solutions/` 或既有制度化经验文档。

### 外部参考

- 无。本计划只基于当前仓库和现有 pitch。

## 关键决策

- v0.1 文档只保留两张标准图：一张系统/概念流图，一张用户阅读路径图。这样可以保持 MVP 表达紧凑，避免被 edge case 驱动。
- 中英文文档使用同一套图，而不是各画各的，以防止 `docs/zh-Hans/` 与 `docs/en/` 之间发生概念漂移。
- 把 `tmp/v0.1/v0.1.md` 视为源概念文档，但把 durable 图表文档沉淀到 `docs/zh-Hans/` 与 `docs/en/` 中，使 shaping 材料与稳定产品文档分离。
- “同步”本身是一级交付目标，不是后续补做的清理动作。中文和英文文档要作为一个整体来编写和审阅。
- 第一轮文档明确排除现有的 fallback/state 图，因为它过度偏向失败处理和实现细节，不符合当前 MVP 讨论目标。

## 开放问题

### 在 planning 阶段已解决

- 文档里需要几张图？两张：一张概念/信息流图，一张阅读路径图。
- 这轮文档是否讨论失败路径？不讨论，这部分明确超出当前 MVP 文档范围。
- 中英文文档结构是否允许不同？不允许，应共享同样的结构和图表清单。

### 延后到实现阶段

- 具体服务命名、模块边界和存储术语。
- 最终产品在实现时到底采用轮询、手动刷新还是其他抓取触发方式。
- 后续版本是否需要单独补充运行态或工程状态图。

## 高层技术设计

> _这一节只用于表达预期方案形态，供评审理解方向，不是实现规范。后续执行者应把它视为上下文，而不是待照抄的代码或实现细节。_

| 文档                                                                     | 目标读者          | 目的                         | 标准内容                                          |
| ------------------------------------------------------------------------ | ----------------- | ---------------------------- | ------------------------------------------------- |
| `docs/zh-Hans/diagrams/v0.1-diagrams.md`                                 | 中文产品/设计讨论 | 用母语快速确认 MVP 共识      | 背景摘要 + 图 1 + 图 2 + 简短图注                 |
| `docs/en/diagrams/v0.1-diagrams.md`                                      | 英文协作/评审     | 为双语读者保留同一套产品模型 | Overview + Diagram 1 + Diagram 2 + short captions |
| `docs/zh-Hans/plans/2026-04-09-001-feat-v0-1-bilingual-diagrams-plan.md` | 中文计划文档      | 当前工作的中文源计划         | 与英文版本保持同构                                |
| `docs/en/plans/2026-04-09-001-feat-v0-1-bilingual-diagrams-plan.md`      | 英文计划文档      | 当前工作的英文同步副本       | 与中文版本保持同构                                |

同步规则：

- 两份图表文档是一组锁定配对文件。
- 两份 plan 文档也是一组锁定配对文件。
- 任何图的新增、删除、改名或改述，都必须在同一次变更中同步修改另一语言版本。
- 图注可以按各自语言自然表达，但底层产品含义必须一致。

标准图集：

1. **MVP 概念流图**
   - 目的：展示从 OPML/feed 输入，到配置语言标题列表、预生成摘要、再到按需在新标签页打开原文链接的产品闭环。
   - 应强调：系统提前准备好用户做阅读判断所需的信息。
   - 应避免：fallback 分支、重试、超时逻辑，以及不会改变产品叙事的内部工程组件。

2. **桌面端阅读路径图**
   - 目的：展示用户如何从扫描配置语言标题，走到打开摘要，再决定是否在新标签页打开原文链接。
   - 应强调：列表页判断、摘要页判断，以及按需在新标签页打开原文链接这一出口动作。
   - 应避免：运行态状态分叉、loading 状态树、实现层 API 编排。

## 实施单元

- [x] **Unit 1: 锁定标准图集与双语叙事边界**

**Goal:** 明确 v0.1 产品文档里到底包含哪些图、排除哪些现有草图，以及中英文文档如何保持同步。

**Requirements:** R2, R3, R4, R5, R6

**Dependencies:** None

**Files:**

- Reference: `tmp/v0.1/v0.1.md`
- Create: `docs/zh-Hans/diagrams/v0.1-diagrams.md`
- Create: `docs/en/diagrams/v0.1-diagrams.md`
- Create: `docs/zh-Hans/plans/2026-04-09-001-feat-v0-1-bilingual-diagrams-plan.md`
- Create: `docs/en/plans/2026-04-09-001-feat-v0-1-bilingual-diagrams-plan.md`

**Approach:**

- 以当前 v0.1 pitch 作为产品意图的源头。
- 只保留那两张能帮助产品/设计读者理解 MVP 的图。
- 把仓库双语文档规则应用到 plan 本身，而不只是后续图表文档。
- 第一轮明确移除 state/fallback 图，避免文档重新滑向实现细节。

**Patterns to follow:**

- 倾向使用简洁 Markdown 结构，让 Mermaid 块紧贴解释文字。
- 保持双语文档结构平行。

**Test scenarios:**

- Test expectation: none -- 本单元只定义文档范围与双语叙事边界。

**Verification:**

- 评审者可以明确说出将要产出的两张图、为什么排除第三张草图，以及 docs 和 plans 的双语同步规则。

- [x] **Unit 2: 编写中文源图表文档**

**Goal:** 产出中文图表文档，作为产品讨论的主文档。

**Requirements:** R1, R2, R3, R5, R6

**Dependencies:** Unit 1

**Files:**

- Create: `docs/zh-Hans/diagrams/v0.1-diagrams.md`
- Reference: `tmp/v0.1/v0.1.md`

**Approach:**

- 开头先给出一句紧凑的 v0.1 产品承诺摘要。
- 图 1 作为系统/产品概念流图。
- 图 2 作为桌面端阅读路径图。
- 每张图下补一小段图注，说明这张图帮助讨论哪个决策问题。

**Patterns to follow:**

- 中文术语与 `tmp/v0.1/v0.1.md` 保持一致。
- 行文保持在产品规格层，不进入实现计划层。

**Test scenarios:**

- Test expectation: none -- 本单元生成的是人类可读的产品文档，不涉及运行时行为。

**Verification:**

- 中文读者仅阅读这个文件，就能理解 MVP 的产品形态，而不需要打开实现文档。

- [x] **Unit 3: 从同一产品模型镜像英文图表文档**

**Goal:** 产出英文版本，并保持与中文版本同一产品含义和图表结构。

**Requirements:** R1, R4, R5, R6

**Dependencies:** Unit 2

**Files:**

- Create: `docs/en/diagrams/v0.1-diagrams.md`
- Reference: `docs/zh-Hans/diagrams/v0.1-diagrams.md`

**Approach:**

- 追求语义等价，而不是逐句直译。
- 保持标题层级、图表顺序和图意与中文文档一致。
- 保持相同的范围纪律，防止英文版重新引入工程细节。
- 把中英文图表文档视为必须一起审阅的同步配对文件。

**Patterns to follow:**

- 章节顺序与 `docs/zh-Hans/diagrams/v0.1-diagrams.md` 一致。
- 使用清晰的产品语言，方便未读中文源文档的协作者使用。

**Test scenarios:**

- Test expectation: none -- 本单元只建立双语文档对齐关系。

**Verification:**

- 双语评审者可以对照两份文件，确认它们表达的是同一个 MVP 与同一组两张图。

## 系统级影响

- **Interaction graph:** 这份 plan 只影响 `docs/` 下的 durable 产品文档，不改变应用行为。
- **Error propagation:** 当前 planning 范围内无此项。
- **State lifecycle risks:** 主要风险是概念范围漂移，使图表重新回到工程状态视角。
- **API surface parity:** 中文和英文图表文档，以及对应的中英文 plan 文档，都是必须保持一致的对齐面。
- **Integration coverage:** 主要质量检查方式是跨文档一致性审阅。
- **Unchanged invariants:** `tmp/v0.1/v0.1.md` 仍然作为 shaping/source 文档保留；本计划不要求改写应用代码或改变产品范围。

## 风险与依赖

| Risk                      | Mitigation                                                   |
| ------------------------- | ------------------------------------------------------------ |
| 图表范围再次滑向实现细节  | 把标准图集固定为两张产品视角图，并明确排除 fallback/state 图 |
| 中英文文档语义漂移        | 先写中文，再从中文镜像出英文                                 |
| plan 本身违反双语文档规则 | 将 plan 成对维护在 `docs/zh-Hans/plans/` 与 `docs/en/plans/` |
| 图注变得空泛或套话        | 每张图注都绑定一个它要回答的 stakeholder question            |

## 文档 / 维护说明

- 若目录不存在，则创建 `docs/zh-Hans/` 与 `docs/en/`。
- 同时创建 `docs/zh-Hans/plans/` 与 `docs/en/plans/`，让 plan 本身也符合双语文档规则。
- 除非产品团队另行决定，否则中文文档作为后续措辞修订的锚点。
- 中英文 plan 文件要和图表文档一起保持同步，不允许只改一侧。
- 如果未来版本需要工程状态图，应放到独立的技术/实现文档里，而不是继续扩张当前 MVP 图表文档。

## Sources & References

- Source concept: `tmp/v0.1/v0.1.md`
- Target docs: `docs/zh-Hans/diagrams/v0.1-diagrams.md`, `docs/en/diagrams/v0.1-diagrams.md`
- Target plan docs: `docs/zh-Hans/plans/2026-04-09-001-feat-v0-1-bilingual-diagrams-plan.md`, `docs/en/plans/2026-04-09-001-feat-v0-1-bilingual-diagrams-plan.md`
