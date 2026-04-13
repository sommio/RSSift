---
title: feat: 实现第一个垂直切片读路径
type: feat
status: completed
date: 2026-04-10
deepened: 2026-04-10
origin:
  - docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md
  - docs/en/api-designs/v0.1-first-vertical-slice-api.md
  - docs/zh-Hans/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md
  - docs/en/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md
---

# feat: 实现第一个垂直切片读路径

## 概览

这份 plan 把已经冻结的第一切片 API 合同落成一个可运行的纵向切片，覆盖 `apps/api` 与 `apps/web`。这个切片继续保持 fixture 驱动：API 从本地数据提供 prepared article items，Web 通过真实 HTTP 合同消费它们，而这次前端实现明确要求在 `apps/web` / `packages/ui` 这条 monorepo 边界上使用 Tailwind CSS 和 shadcn/ui，并通过显式配置与 lint/format guardrail 约束后续 agent 的样式行为。

## 问题背景

合同层工作已经在 `docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md` 与 `docs/en/api-designs/v0.1-first-vertical-slice-api.md` 中完成。当前还缺的是一个可运行证明：仓库是否已经能把这份合同端到端地提供出来并渲染出来。

当前代码库基本仍是脚手架：`apps/api` 只有 health endpoint，`apps/web` 仍然渲染模板首页。所以这次 planning 的重点不是继续定义产品语义，而是规划如何把第一条真实读路径落地，同时避免范围意外扩张到 ingestion、持久化或更大的产品面。

这次规划还需要继承用户新增约束：

- `apps/web` 的 reader shell 必须使用 Tailwind CSS 与 shadcn/ui，而不是继续使用手写模板 CSS。
- `apps/web` 需要显式引入 `tailwind.config.js` 作为可审查的 Tailwind guardrail，并从 CSS 入口显式加载，避免 agent 在 theme extension、plugin/source wiring 上随意漂移。
- Tailwind class authoring 还要额外受 `eslint-plugin-better-tailwindcss` 与 `prettier-plugin-tailwindcss` 约束；之所以改用前者，是因为 `eslint-plugin-tailwindcss` 对 Tailwind CSS v4 仍缺少稳定支持。
- 非平凡实现应遵守 `AGENTS.md` 中的 delegation-first 执行姿态。
- 除了 delegation-first，还要遵循 `AGENTS.md` 的 skill-level conventions，按作用域调用对应 skills，避免前后端实现跑偏。
- 进入 `/ce:work` 前，任何新增 package 安装都必须先知会用户。

## 需求追踪

- R1. 对外 API 只能暴露 `GET /articles` 与 `GET /articles/:id`（见 origin: `docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md`）。
- R2. 可运行切片必须覆盖双栏阅读器的最小读闭环：左栏文章列表与右栏文章详情。
- R3. 列表响应必须且只能暴露 `id`、`title`、`sourceTitle`、`publishedAt`、`originalUrl`。
- R4. 详情响应必须且只能暴露 `title`、`sourceTitle`、`publishedAt`、`summary`、`originalUrl`。
- R5. 这个切片不能长出分页、筛选、鉴权、刷新/重试控制、摘要状态字段或翻译行为。
- R6. 实现必须保持 origin 文档里的产品语义：客户端消费的是 prepared reading items，而不是后台流程控制面。
- R7. `apps/web` 必须用 Tailwind CSS 与 shadcn/ui primitives 实现 reader shell。
- R8. 第一个可运行切片必须继续保持 fixture-backed，只建模 prepared article items，不实现 `config.opml` 读取或真实 feed ingestion。
- R9. 本次工作必须遵守 `AGENTS.md` 中的 monorepo 架构要求：workspace layout、package boundaries、shared configuration、task graph 行为与 repo-level conventions 都不能被破坏。
- R10. 实施路径中如需安装新 package，必须在执行前明确告知用户。
- R11. 执行时默认采用 delegation-first 的实现方式，最后由主执行者完成集成与验证。
- R12. 当第一个切片已经能取代模板演示用途时，`apps/api` 与 `apps/web` 中仅用于模板展示的行为与文件应被删除或替换。
- R13. 新的 registry package 必须使用 `pnpm` 在真正使用它的 package 中安装当时的最新稳定版本；如果依赖解析演变成 peer conflict、override 或其他依赖地狱，必须先停下来询问用户，再决定是否强行处理。
- R14. `apps/web` 必须检入显式的 `tailwind.config.js`，并从 Tailwind CSS 入口显式加载它，让 theme extension、plugin boundary 与 monorepo source registration 成为可审查的 guardrail，而不是执行时的临时决定。
- R15. Tailwind class authoring 必须同时受 `eslint-plugin-better-tailwindcss` 与 `prettier-plugin-tailwindcss` 约束；这里明确不用 `eslint-plugin-tailwindcss`，因为它对 Tailwind CSS v4 仍缺少稳定支持；两者同样受 R13 的“最新稳定版 + 依赖地狱停问”规则约束。
- R16. 实施必须遵循 `AGENTS.md` 的 skill-level conventions：`apps/api` 用 `nestjs-best-practices`；`apps/web` 的 Next.js 实现用 `next-best-practices`；前端架构用 `feature-sliced-design`；前端页面设计按 `frontend-design` → `ui-ux-pro-max` → `ckm-design-system` → `ckm-ui-styling` 的顺序调用，避免 agent 跑偏。

## 范围边界

- 不实现真实 RSS ingestion、OPML 解析、定时调度、持久化或摘要生成工作流。
- 不新增鉴权、分页、排序控制、筛选、已读/收藏状态或 feed 管理 UI。
- 引入 `packages/ui`，但只用于可复用的 UI primitive 与 helper；不要把 reader-specific composition、路由或 API 访问逻辑搬进这个 package。
- 第一切片不引入新的共享业务合同 package，除非实施时真的出现第二个 consumer，或出现无法在当前切片内控制的 contract drift。
- 不在产品语义未变化的前提下改写已经冻结的 API design 文档。
- 不删除仍然服务于仓库的共享构建、测试与工具基础设施；只移除已经被 vertical slice 取代的 scaffold artifact。
- 不把 Tailwind 约束藏在执行者的临时习惯里；应把样式 guardrail 显式落在 `apps/web/tailwind.config.js`、`apps/web/app/globals.css`、`packages/eslint-config` 与 root Prettier 配置中。

## 背景与调研

### 相关代码与模式

- `apps/api/src/health.controller.ts`、`apps/api/src/health.service.ts`、`apps/api/src/app.module.ts` 展示了当前 NestJS 的 controller/service/module 接线模式。
- `apps/api/src/health.controller.spec.ts` 与 `apps/api/test/app.e2e-spec.ts` 展示了当前 controller-level test 与 HTTP e2e 的测试分层。
- `apps/api/src/main.ts` 已经开启了 CORS，这让浏览器侧消费 API 仍然可行，但并不强迫本切片必须采用 client-fetch 架构。
- `apps/web/app/page.tsx`、`apps/web/app/layout.tsx`、`apps/web/app/page.spec.tsx` 展示了当前 Next.js App Router 与页面测试基线。
- `apps/web/e2e/home.spec.ts` 与 `apps/web/playwright.config.ts` 展示了现有浏览器测试入口，但它们现在只覆盖模板页。
- `apps/web/package.json` 当前没有 Tailwind CSS、shadcn/ui、Radix UI 或相关工具依赖；这次是净新增的前端栈引入。
- `packages/eslint-config/base.js`、`packages/eslint-config/next.js`、`apps/web/eslint.config.mjs` 与 root `package.json` 展示了当前共享 lint / tooling ownership；如果要给 Tailwind 增加静态 guardrail，应优先挂在这些既有边界上，而不是把更多 repo 级规则塞回 app 内。
- root `package.json` 已经持有仓库级 Prettier script，但当前缺少已检入的 `.prettierrc.mjs`；这意味着 Tailwind class 排序约束应通过 root Prettier config 落盘，而不是让每个 app 自行漂移。
- 当前 app 级模板残留仍体现在 `apps/api/src/health.controller.ts`、`apps/api/src/health.service.ts`、`apps/api/test/app.e2e-spec.ts`、`apps/web/app/page.tsx`、`apps/web/app/layout.tsx`、`apps/web/e2e/home.spec.ts` 与两个 app README 中；当第一切片落地后，应在不破坏仓库基础设施的前提下替换或删除这些不再代表真实产品行为的内容。

### 制度化经验

- `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md` 与 `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md` 明确要求：只要范围或语义移动，中英文文档与对应 plan 就必须一起更新。
- 同一条 learning 还提醒要避免 path drift。因此新的 implementation plan 需要显式指向当前 API design docs 与上一份 API plan，而不能假设读者会自己推断文档谱系。

### 外部参考

- Tailwind CSS 官方 Next.js 安装文档：`https://tailwindcss.com/docs/installation/framework-guides/nextjs`
- Tailwind CSS 官方 functions / directives 文档：`https://tailwindcss.com/docs/functions-and-directives`
- Tailwind CSS 官方 source detection 文档：`https://tailwindcss.com/docs/detecting-classes-in-source-files`
- shadcn/ui 手动安装文档：`https://ui.shadcn.com/docs/installation/manual`
- shadcn/ui monorepo 文档：`https://ui.shadcn.com/docs/monorepo`
- `prettier-plugin-tailwindcss` 官方仓库：`https://github.com/tailwindlabs/prettier-plugin-tailwindcss`
- `eslint-plugin-better-tailwindcss` 官方仓库：`https://github.com/schoero/eslint-plugin-better-tailwindcss`
- `eslint-plugin-tailwindcss` 官方仓库（未选用；原因是 Tailwind CSS v4 支持尚不稳定）：`https://github.com/francoismassart/eslint-plugin-tailwindcss`
- Turborepo monorepo best practices：`https://raw.githubusercontent.com/vercel/turborepo/refs/heads/main/skills/turborepo/references/best-practices/RULE.md`

## 关键技术决策

- 第一个可运行数据源继续保持为 `apps/api` 内的 prepared-items fixture。API 只读取本地确定性文章数据，并暴露已经冻结的 list/detail 合同，这样后续 ingestion 工作只需要替换一个 adapter seam，而不是重写对外 surface。
- Web 第一版采用 URL 驱动的服务端数据读取。`apps/web` 通过基础地址配置与 `articleId` search param 在服务端获取列表与详情，这样可以先把切片跑通，而不必同时发明 client-side cache 或 mutation model。
- 这次直接引入 `packages/ui` 作为一个窄而清晰的 library package，用来承载可复用的 shadcn/ui primitive 与 helper。这样更符合 Turborepo 对共享代码进入 `packages/` 的最佳实践，也能让 `apps/web` 保持聚焦在路由、数据读取与 reader-specific composition 上。
- 把 `apps/web/tailwind.config.js` 当成有意引入的 guardrail。虽然 Tailwind CSS v4 以 CSS-first 为主，但这次仍保留显式 JS config，并在 `apps/web/app/globals.css` 里通过 `@config` 加载；同时在同一个 CSS 入口里通过 `@source` 或等价的 v4-compatible source registration 把 `packages/ui` 纳入扫描范围。这样 theme/token/plugin/source 约束都能落盘，避免 agent 后续自由漂移。
- 第一切片不创建共享业务 contract package。当前合同故意保持很小，仓库里也没有现成的 business-types package 可复用；当前阶段用显式 API 测试与窄边界的 web adapter 已足以控制 parity。只有在出现第二个 consumer 或持续 drift 时再重新评估。
- 把 Tailwind 静态约束挂到现有 monorepo tooling ownership 上：`packages/eslint-config` 持有 `eslint-plugin-better-tailwindcss` 并扩展 Next.js preset；repo root 持有 `.prettierrc.mjs` 与 `prettier-plugin-tailwindcss`，并在 Tailwind v4 场景下通过 `tailwindStylesheet` 指向 `apps/web/app/globals.css`。之所以改用 `eslint-plugin-better-tailwindcss`，是因为它的最新稳定版 peer range 已显式覆盖 Tailwind CSS v4，而 `eslint-plugin-tailwindcss` 对 v4 仍缺少稳定支持。若前者在当前仓库里仍出现显著误报、解析错误或不可接受的规则噪音，执行时必须先停下来询问用户，而不是静默切换到其他 lint 栈或移除约束。
- 把 package disclosure 当成分阶段承诺。进入 `/ce:work` 前，需要先把当前已知 package 清单告诉用户，并按归属边界分组：repo root 只放仓库级工具，例如 `prettier-plugin-tailwindcss`；`packages/eslint-config` 放 lint 规则依赖，例如 `eslint-plugin-better-tailwindcss`；`apps/web` 负责 Tailwind/build tooling，例如 `tailwindcss`、`@tailwindcss/postcss`、`postcss`；`packages/ui` 负责 UI library 的 runtime/helper 依赖，例如 `class-variance-authority`、`clsx`、`tailwind-merge`、`lucide-react`、`tw-animate-css`、`@radix-ui/react-slot`、`@radix-ui/react-scroll-area`、`@radix-ui/react-separator`；`apps/web` 通过 workspace dependency 消费 `@repo/ui`。执行时应使用 `pnpm` 解析当时最新稳定版，而不是把 planning 阶段的版本号写死。shadcn generator 应视为临时工具，而不是长期保留在 root 的 dependency。若实施中发现额外 component-specific dependency，必须先补充披露；若安装需要 override、强行 peer-resolution 或其他依赖地狱手段，也必须先停下来询问用户。当前不计划为 API 新增 runtime package。
- 执行阶段沿用仓库的 delegation-first 姿态。平台支持时，非平凡实现单元应优先委派；主执行者负责集成、验收与最终验证。
- 执行阶段还要把 `AGENTS.md` 的 skill-level conventions 视为硬性 guardrail：`apps/api` 代码与架构沿用 `nestjs-best-practices`；`apps/web` 的 Next.js 边界遵循 `next-best-practices`；前端架构引用 `feature-sliced-design`；页面设计与样式实现按 `frontend-design` → `ui-ux-pro-max` → `ckm-design-system` → `ckm-ui-styling` 顺序执行，并最终回到 `frontend-design` 验收回路。
- 把删除 scaffold-only 模板残留也纳入这次切片，而不是让它们与真实功能并存。article read path 应成为两个 app 的新默认 proof surface，因此模板首页文案、演示型浏览器断言，以及不再服务仓库目标的 API health-demo 接线，都应在同一次工作里被替换或删除。

## 开放问题

### 在 planning 阶段已解决

- 这个切片现在是否接入真实 ingestion？否。继续保持 fixture-backed，只代表 prepared reading items。
- Tailwind CSS 与 shadcn/ui 是否现在就抽成共享 UI workspace？是。现在就引入 `packages/ui` 来承载可复用 primitive，而 reader-specific 组合仍留在 `apps/web`。
- Web 第一版是做 client-side stateful fetching，还是先做 URL 驱动的 server-rendered read path？先做以 `articleId` 为键的 URL 驱动服务端读取。
- 哪些 package 需要在实施前先告知用户？包括 app 级 Tailwind/build 包、`packages/ui` 的 runtime/helper 包，以及实施中新增发现的 component-specific 包。
- 安装策略应该是什么？使用 `pnpm` 在真正使用该依赖的 package 中安装当时最新稳定版；一旦出现 override、peer 冲突或其他依赖地狱，需要先停下来询问用户。
- 这个可运行切片的本地默认接线契约是什么？在 `apps/web` 中把 `API_BASE_URL=http://127.0.0.1:3000` 作为本地示例值写清楚，同时 `apps/web` 自身继续运行在 3001 端口。
- 哪些模板残留需要在实施中主动清掉？需要移除或替换 `apps/web` 的模板首页文案与 metadata、`apps/web/e2e/home.spec.ts` 中的模板断言、两个 app 的通用模板 README，以及 `apps/api` 中如果已不再服务切片目标的 health-demo module/tests。
- 如何把 Tailwind 规则显式化以约束后续 agent？在 `apps/web` 检入 `tailwind.config.js`，并在 `apps/web/app/globals.css` 中通过 `@config` 加载，同时显式登记 `packages/ui` 的 Tailwind source 范围。
- Tailwind lint / format guardrail 应挂在哪里？`packages/eslint-config` 持有 `eslint-plugin-better-tailwindcss`，repo root 持有 `.prettierrc.mjs` 与 `prettier-plugin-tailwindcss`，`apps/web` 只持有实际运行所需的 Tailwind / PostCSS 配置。
- skill 调用应该如何写进实施约束？按 `AGENTS.md` 强制区分：API 单元走 `nestjs-best-practices`；Next.js 与 App Router 单元走 `next-best-practices`；前端架构补充 `feature-sliced-design`；页面设计与样式单元按四个前端 skills 的顺序执行。

### 延后到实现阶段

- reader shell 中 empty state 与 error state 的最终文案。
- 后续切片是否需要把第一版 `@repo/ui` 从最简 workspace-library 形态升级为独立编译产物。
- fixture 数据集的最终规模，只要它仍然足够小且保持测试确定性即可。

## 高层技术设计

> _这一节用于表达预期方案形状，供评审确认方向；它是方向性指导，不是实现规范。执行者应把它当作上下文，而不是可直接照抄的代码。_

```mermaid
flowchart LR
    subgraph API[apps/api]
        Fixture[prepared article fixture JSON] --> Repo[fixture-backed article source]
        Repo --> Service[articles service]
        Service --> ListEndpoint[GET /articles]
        Service --> DetailEndpoint[GET /articles/:id]
    end

    subgraph UI[packages/ui]
        Button[@repo/ui/button]
        Card[@repo/ui/card]
        ScrollArea[@repo/ui/scroll-area]
        Separator[@repo/ui/separator]
    end

    subgraph Web[apps/web]
        Page[App Router page + articleId search param] --> Client[server-side article API helper]
        Client --> ListEndpoint
        Client --> DetailEndpoint
        Page --> Reader[reader-specific composition]
        Reader --> Button
        Reader --> Card
        Reader --> ScrollArea
        Reader --> Separator
    end
```

## 实施单元

- [x] **Unit 1: 在 `apps/api` 中加入 fixture-backed article read module**

**Goal:** 用本地 prepared-items 数据源暴露已经冻结的 list/detail 合同，同时不引入 ingestion 或持久化。

**Requirements:** R1, R2, R3, R4, R5, R6, R8, R9, R11, R12, R16

**Dependencies:** None

**Files:**

- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/src/articles/articles.module.ts`
- Create: `apps/api/src/articles/articles.controller.ts`
- Create: `apps/api/src/articles/articles.service.ts`
- Create: `apps/api/src/articles/article-fixture.repository.ts`
- Create: `apps/api/src/articles/articles.types.ts`
- Create: `apps/api/src/articles/fixtures/prepared-articles.json`
- Create: `apps/api/src/articles/articles.controller.spec.ts`
- Create: `apps/api/test/articles.e2e-spec.ts`
- Delete: `apps/api/src/health.controller.ts`
- Delete: `apps/api/src/health.service.ts`
- Delete: `apps/api/src/health.controller.spec.ts`
- Delete: `apps/api/test/app.e2e-spec.ts`
- Modify: `apps/api/README.md`

**Approach:**

- fixture source 里只存 prepared article items，让临时 seam 直接对齐公共读合同，而不是提前建模 ingestion 输入。
- 把 fixture 读取放在 repository/adapter 边界后面，这样后续真实数据准备链路只需要替换一个依赖，而不必改 controller 或 route。
- `GET /articles` 必须省略 `summary`；`GET /articles/:id` 必须返回 prepared summary。未知文章 ID 走 HTTP 404，而不是发明新的合同字段。
- 第一切片保留确定性的 fixture 顺序，让测试稳定，但不要把这件事扩写成长期产品排序语义。
- 如果 template health-demo module 已经不再服务这个可运行切片，应在同一次工作里删除，避免 `apps/api` 同时暴露真实 article surface 与 scaffold-only 行为。
- API README 也要同步改成与切片相关的本地运行说明，而不是保留失效的模板教学文字。
- API feature module 的落位要遵循 `AGENTS.md` 与 `nestjs-best-practices`：保持自包含的 feature folder，避免退回到 repository-wide technical-layer folders。

**Execution note:** Execution target: external-delegate。平台支持时，优先把 API module 的编码工作委派出去，再由主执行者核对路由与测试结果。

**Patterns to follow:**

- `apps/api/src/health.controller.ts`
- `apps/api/src/health.service.ts`
- `apps/api/src/health.controller.spec.ts`
- `apps/api/test/app.e2e-spec.ts`

**Test scenarios:**

- Happy path — `GET /articles` 返回的数组项字段必须正好是 `id`、`title`、`sourceTitle`、`publishedAt`、`originalUrl`，且不能出现 `summary`。
- Happy path — `GET /articles/:id` 返回被选中文章的详情，字段必须是 `title`、`sourceTitle`、`publishedAt`、`summary`、`originalUrl`。
- Edge case — fixture 中存在多篇 prepared item 时，列表响应顺序保持确定性，避免测试在不同运行间抖动。
- Error path — 请求未知 `articleId` 时返回 HTTP 404，而不是返回部分成功 payload。
- Integration — 当模板 health endpoint 已不再需要时，可运行 API 只保留 article routes，而不再额外暴露 scaffold endpoint。

**Verification:**

- API 对外暴露的就是文档定义的 article 读路径，payload shape 与合同一致，数据源 seam 仍然只局限在 article module 内，同时过时的模板 API 行为已经被移除。

- [x] **Unit 2: 创建 `packages/ui` 并接好 Web UI 与 Tailwind guardrail 基线**

**Goal:** 建立一个窄而清晰的 `packages/ui` workspace，用来承载可复用的 shadcn/ui primitive，并让 `apps/web` 在不破坏 monorepo 架构的前提下接好 Tailwind runtime、lint、format 三层 guardrail。

**Requirements:** R7, R9, R10, R11, R13, R14, R15, R16

**Dependencies:** None

**Files:**

- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/app/globals.css`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.js`
- Modify: `packages/eslint-config/package.json`
- Modify: `packages/eslint-config/next.js`
- Create: `.prettierrc.mjs`
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/components.json`
- Create: `packages/ui/src/lib/utils.ts`
- Create: `packages/ui/src/components/ui/button.tsx`
- Create: `packages/ui/src/components/ui/card.tsx`
- Create: `packages/ui/src/components/ui/scroll-area.tsx`
- Create: `packages/ui/src/components/ui/separator.tsx`

**Approach:**

- 在开始安装前，先把精确 package 列表展示给用户，并按“谁使用就装到谁那里”的原则分组：repo root 只放仓库级 Prettier 插件，Tailwind/build tooling 装在 `apps/web`，Tailwind ESLint 插件装在 `packages/eslint-config`，UI runtime/helper 装在 `packages/ui`，`apps/web` 通过 workspace dependency 使用 `@repo/ui`。这里 Tailwind ESLint 插件明确选 `eslint-plugin-better-tailwindcss`，因为 `eslint-plugin-tailwindcss` 对 Tailwind CSS v4 仍缺少稳定支持。
- 创建 `packages/ui`，并让它只承担一件事：导出可复用的 shadcn/ui primitive 与 helper。保持清晰 `exports`，避免跨 package 相对路径 import，也不要用宽泛的 barrel export 破坏边界。
- 在 `apps/web` 检入显式的 `tailwind.config.js` 作为可审查 guardrail，并在 `apps/web/app/globals.css` 里通过 `@config` 显式加载；同时用 `@source` 或等价的 Tailwind v4 source registration 把 `packages/ui` 纳入扫描范围，避免共享 primitive 的 class 被漏掉。
- 在 `packages/eslint-config` 而不是 app 本地挂入 `eslint-plugin-better-tailwindcss`，让 `apps/web` 继续通过现有 shared Next.js preset 接受 Tailwind lint 约束；root `.prettierrc.mjs` 则挂入 `prettier-plugin-tailwindcss`，并用 `tailwindStylesheet` 指向 `apps/web/app/globals.css`。如果 `packages/ui` 引入 `cn` / `cva` 之类 helper，也要同步把对应函数名纳入 Prettier 的 Tailwind sorting 配置。
- 新的 registry dependency 在执行时必须使用 `pnpm` 解析当时最新稳定版；如果安装过程中出现 peer conflict、override 需求或其他依赖地狱，必须先停下来询问用户，再决定如何继续。
- 如果最新稳定版的 `eslint-plugin-better-tailwindcss` 在当前 Tailwind v4 monorepo 组合下依然产生明显误报、解析错误或规则不可用，执行必须停下来询问用户，而不是静默切到别的 lint 栈或放弃这层 guardrail。

**Execution note:** Execution target: external-delegate。在任何 install 行为前，先把 package 列表告知用户；坚持使用 `pnpm`，并在依赖解析不再直观时暂停。此单元实现时应遵循 `next-best-practices`、`feature-sliced-design` 与 `AGENTS.md` 的 frontend skill guardrail。

**Patterns to follow:**

- `package.json`
- `apps/web/app/layout.tsx`
- `apps/web/app/globals.css`
- `packages/eslint-config/next.js`
- `apps/web/eslint.config.mjs`
- shadcn/ui monorepo 文档
- Turborepo monorepo best practices

**Test scenarios:**

- Tooling — `apps/web/app/globals.css` 能显式加载 `apps/web/tailwind.config.js`，并把 `packages/ui` 纳入 Tailwind source detection。
- Tooling — `pnpm lint` 时 Tailwind lint 规则通过 `packages/eslint-config` 作用到 `apps/web`，而不是靠 app 内零散私配。
- Tooling — `pnpm format:check` 通过 root `.prettierrc.mjs` 与 `prettier-plugin-tailwindcss` 稳定排序 `className` / `cn()` / `cva()` 中的 Tailwind classes。
- Error path — 如果最新稳定版 `eslint-plugin-better-tailwindcss` 无法在当前 Tailwind v4 组合下稳定工作，实施必须暂停并回到用户确认，而不是擅自更换 lint 栈或削弱约束。

**Verification:**

- `apps/web` 通过 `@repo/ui` 消费可复用 UI primitive，共享 UI 代码不再躺在 app 包里；`apps/web/tailwind.config.js`、`packages/eslint-config` 与 root `.prettierrc.mjs` 共同形成显式样式 guardrail；同时新的 workspace package 没有造成 root runtime dependency 膨胀或包边界泄漏。

- [x] **Unit 3: 加入 Web 侧 API 读取边界与 URL 驱动的选择模型**

**Goal:** 让 `apps/web` 通过一个明确的服务端边界消费真实 article API 合同，并把文章选择状态稳定落在 `articleId` URL 参数上。

**Requirements:** R2, R3, R4, R6, R7, R8, R9, R11, R16

**Dependencies:** Unit 1, Unit 2

**Files:**

- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/page.spec.tsx`
- Create: `apps/web/lib/articles-api.ts`
- Create: `apps/web/.env.example`
- Test: `apps/web/e2e/home.spec.ts`

**Approach:**

- 在服务端读取 `API_BASE_URL`，把网络访问集中在一个 web-side helper 内，而不是把 fetch 散落到展示组件里。
- 把 `http://127.0.0.1:3000` 作为 `API_BASE_URL` 的本地文档示例值，并保证 `.env.example` 与后续 README 里的值同步。
- 先取 article list，再从 `searchParams.articleId` 或第一篇文章推导 selected id，然后获取对应 detail。
- 当 list 为空时渲染 empty reader shell 并跳过 detail 请求；当所选 detail 不可用时，保留 list 并在 detail pane 渲染 unavailable state，而不是把整页一起打断。
- helper 对字段映射严格围绕文档合同，不允许 web 层自行发明状态字段或控制字段。

**Execution note:** Execution target: external-delegate。此单元实现时应遵循 `next-best-practices`；如果页面结构或 slice placement 发生变化，还要参考 `feature-sliced-design`。

**Patterns to follow:**

- `apps/web/app/page.tsx`
- `apps/web/app/page.spec.tsx`
- `docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md`
- `docs/en/api-designs/v0.1-first-vertical-slice-api.md`

**Test scenarios:**

- Happy path — 当 API 返回文章且没有 `articleId` 时，页面默认渲染第一篇文章的 detail。
- Happy path — 当 `searchParams.articleId` 指向一篇存在的文章时，页面渲染对应 detail。
- Edge case — 当 list endpoint 返回空数组时，页面展示 empty state，并跳过 detail fetching。
- Error path — 当 `API_BASE_URL` 缺失时，页面抛出明确的配置错误，而不是模糊的 fetch failure。
- Error path — 当过期 `articleId` 导致 404 时，list 仍可见，detail pane 切换到 unavailable state。
- Integration — 详情 pane 中的原文链接应直接来自 API response，而不是由 Web 自己拼接 URL；左栏列表不额外暴露原文跳转入口。
- Integration — `apps/web/e2e/home.spec.ts` 的浏览器覆盖要证明：默认选中第一篇文章、切换文章后 URL 带上 `articleId`、刷新后选择保持不变，以及 stale article fallback 能对着运行中的 API 成立。

**Verification:**

- 页面只保留一条清晰的 web-to-api seam，文章选择状态可以通过 URL 刷新与分享稳定复现，而且本地 API 接线不需要靠人工猜端口。

- [x] **Unit 4: 用 shadcn/ui primitives 组合双栏 reader shell**

**Goal:** 在不突破冻结合同与范围边界的前提下，把模板首页替换成第一版真实双栏阅读器 UI。

**Requirements:** R2, R3, R4, R5, R6, R7, R8, R9, R11, R12, R16

**Dependencies:** Unit 2, Unit 3

**Files:**

- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/page.spec.tsx`
- Create: `apps/web/components/article-list.tsx`
- Create: `apps/web/components/article-detail.tsx`
- Create: `apps/web/components/article-reader-shell.tsx`
- Test: `apps/web/e2e/home.spec.ts`

**Approach:**

- 使用小范围 shadcn/ui primitive 集合，例如 `Card`、`Button`、`ScrollArea`、`Separator` 来构建 desktop-first 的 reader shell。
- 左栏只展示标题、来源与发布时间，并让整卡用于站内文章切换；右栏只展示当前选中文章的标题、来源、发布时间、摘要与原文链接。
- 通过 Tailwind/shadcn 样式清晰表达当前选中项，并保持 URL 驱动导航，避免第一切片就依赖额外 client-side store。
- empty state 与 unavailable state 也必须落在同一套设计系统里，而不是保留模板页或裸异常文本。
- 同时替换模板页的 title/description 与 landing-page copy，让 `apps/web` 在 reader shell 落地后不再继续把自己呈现成通用 monorepo starter。

**Execution note:** Execution target: external-delegate。此单元必须按 `frontend-design` → `ui-ux-pro-max` → `ckm-design-system` → `ckm-ui-styling` 的顺序执行，并用 `frontend-design` 的验收回路校对最终 reader shell；同时保持 `next-best-practices` 与 `feature-sliced-design` 的边界约束。

**Patterns to follow:**

- `apps/web/app/page.tsx`
- `apps/web/app/page.spec.tsx`
- `packages/ui/src/components/ui/*`
- `packages/ui/package.json` 的 exports map

**Test scenarios:**

- Happy path — 页面在左栏渲染可扫读的文章列表，在右栏渲染当前选中文章的摘要。
- Happy path — 当前选中文章在视觉上可区分，切换另一篇文章后 detail 跟着更新。
- Edge case — 长标题与长摘要在滚动容器中仍然可读，不会压坏双栏布局。
- Error path — empty state 与 detail unavailable state 都通过同一套 shadcn/Tailwind shell 渲染，而不是退回模板 markup。
- Integration — 两个 pane 都按 API 合同暴露 `originalUrl` 链接。
- Integration — 浏览器级导航会把当前选择稳定编码进 `articleId`，页面刷新后仍保留同一篇 detail 视图。

**Verification:**

- Web 已经呈现出预期的第一版阅读切片，而不是模板页；它的 metadata 与可见文案不再像 starter-template 文本，且界面上每个可见字段都能回溯到合同定义。

- [x] **Unit 5: 加入跨应用验证与面向开发者的切片运行说明**

**Goal:** 用端到端方式证明这个纵向切片已经可运行，并把本地运行所需的最小设定写清楚。

**Requirements:** R1, R2, R3, R4, R7, R8, R9, R10, R11, R12, R16

**Dependencies:** Unit 1, Unit 2, Unit 3, Unit 4

**Files:**

- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/e2e/home.spec.ts`
- Modify: `apps/web/README.md`
- Modify: `apps/web/.env.example`

**Approach:**

- 用 reader-flow 测试替换模板浏览器测试，验证真实 API 合同，而不是验证静态模板内容。
- 让浏览器验证阶段同时具备 API 与 Web 两个服务，并通过 `API_BASE_URL` 保持环境契约显式可见。
- 把本地默认接线固定为仓库现有默认值：`apps/api` 使用 3000 端口，`apps/web` 使用 3001 端口，`API_BASE_URL` 示例值固定为 `http://127.0.0.1:3000`。
- 在 Web README 中写清楚本地环境要求与已提前披露的 package additions，让第一切片的运行方式不需要靠读代码反推。
- fixture 数据集应保持足够小，使端到端验证快速且确定。

**Execution note:** Execution target: external-delegate。测试接线与 README 更新仍应遵循 `next-best-practices` 的 Next.js 环境与路由边界约束。

**Patterns to follow:**

- `apps/web/playwright.config.ts`
- `apps/web/e2e/home.spec.ts`
- `apps/api/test/app.e2e-spec.ts`

**Test scenarios:**

- Happy path — 浏览器进入 reader 后能看到文章列表，并渲染当前选中文章详情。
- Happy path — 切换另一篇文章后，URL 与 detail pane 一起更新。
- Edge case — 无数据场景下仍渲染 empty-state shell，且不会出现运行时崩溃。
- Error path — 浏览器验证时如果 API 不可用，测试应快速失败并给出可读错误，而不是无限等待。
- Integration — API e2e 与浏览器覆盖一起证明真实 HTTP 合同已经跨 `apps/api` 与 `apps/web` 生效。

**Verification:**

- 仓库里已经存在一条窄而真实的浏览器流，以及对应的 API 覆盖，足以证明第一切片跨应用边界可运行；同时任何协作者都无需猜测端口或 env 名称就能在本地跑起来。

## 系统级影响

- **Interaction graph:** `apps/api/src/articles/fixtures/prepared-articles.json` 提供给 article repository，再提供给 Nest service/controller，随后被 `apps/web` 里的 server-side article helper 消费，最终驱动 App Router page 与 reader components。
- **Error propagation:** 未知 article ID 在 API 保持 HTTP 404。Web 层应把 list-load failure 当成 page-level failure，把 stale detail failure 当成 pane-level unavailable state，而不是增加额外 API 字段。
- **State lifecycle risks:** 文章选择状态移动到 `articleId` URL 参数中，从而让刷新与分享语义稳定，不依赖 client-only state store。
- **API surface parity:** fixture shape、API controller response、web helper type 与最终 UI visible fields 都必须和 API design docs 保持一致。
- **Integration coverage:** 只有 API contract tests 与跨应用浏览器验证都成立，这个切片才算真正绿灯。
- **Unchanged invariants:** 这个切片仍然不实现 OPML ingestion、持久化、鉴权、刷新控制、分页、筛选或摘要状态字段。
- 即使删除 app 级模板残留，workspace 级工具链、lint/typecheck/test task wiring 与 monorepo package 边界也保持不变。

## 风险与依赖

| Risk                                                                                                  | Mitigation                                                                                                                               |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 引入 `packages/ui` 会增加跨 workspace 的导出与依赖管理复杂度                                          | 保持 `packages/ui` 单一职责，按使用方安装依赖，使用清晰 exports 而不是大一统 barrel file，并把 reader-specific 组合继续留在 `apps/web`。 |
| 不建立共享 contract package 可能让 API 与 Web 漂移                                                    | 保持合同极小，把映射集中在 `apps/web/lib/articles-api.ts`，并用 API e2e + 浏览器验证兜底。                                               |
| 跨应用浏览器验证容易变脆                                                                              | 使用确定性的 fixture 数据集，保持浏览器场景窄而稳定，并让 API 不可用时快速失败。                                                         |
| fixture-backed 数据可能意外固化成伪生产模型                                                           | fixture 只保存 prepared read items，并被 repository seam 隔离，便于后续 ingestion 替换。                                                 |
| `eslint-plugin-better-tailwindcss` 在当前 Tailwind CSS v4 monorepo 组合下仍可能存在规则噪音或解析边角 | 先按稳定版接入并用 lint 验证；若出现明显误报或解析问题，暂停并询问用户，而不是擅自更换 lint 栈、加 override 或去掉规则。                 |

## 文档 / 运维说明

- 进入 `/ce:work` 前，需要再次把当前已知的 package additions 告知用户，并按归属 package 分组说明。执行时必须使用 `pnpm` 获取当时最新稳定版；如果安装演变成依赖地狱，必须先停下来询问用户，而不是直接加 override 或强行降级。
- 如果实施中 scope 变化足以影响冻结的 API 合同或已选前端架构，需要在同一次工作里同步更新这份 plan 及其英文配对文档。
- 删除模板残留时，要在同一次工作里同步更新或删除对应 README / test 文案，避免 scaffold wording 与已交付切片并存。
- `API_BASE_URL=http://127.0.0.1:3000` 这个本地示例值，以及对应的本地验证预期，应写入 `apps/web/README.md` 与 `apps/web/.env.example`，并与仓库当前默认端口保持一致。
- 把 monorepo 边界写清楚：共享 UI primitive 在 `packages/ui`，而 app-specific reader 组件与数据访问继续留在 `apps/web`。
- `apps/web/tailwind.config.js`、`apps/web/app/globals.css`、`packages/eslint-config` 与 root `.prettierrc.mjs` 一起构成 durable Tailwind guardrail；后续实现不应把 theme/plugin/source 规则散落到其它位置，除非双语 plan 同步更新。
- 执行时必须遵循 `AGENTS.md` 的 skill-level conventions：`apps/api` 用 `nestjs-best-practices`，`apps/web` 的 Next.js 实现用 `next-best-practices`，前端架构用 `feature-sliced-design`，前端页面设计按 `frontend-design` → `ui-ux-pro-max` → `ckm-design-system` → `ckm-ui-styling` 的顺序执行。若某个必需 skill 无法干净应用，应先停下来协调，再继续编码。
- 继续遵守 Turborepo 的 root-minimal 原则：root 只承载仓库级工具（例如 Prettier plugin/config），Tailwind runtime、Radix runtime 与 app/library 依赖都留在实际使用它们的 workspace package 中。

## Sources & References

- **Origin documents:** `docs/zh-Hans/api-designs/v0.1-first-vertical-slice-api.md`, `docs/en/api-designs/v0.1-first-vertical-slice-api.md`, `docs/zh-Hans/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`, `docs/en/plans/2026-04-09-002-feat-v0-1-first-vertical-slice-api-plan.md`
- **Related code:** `package.json`, `packages/eslint-config/next.js`, `apps/api/src/health.controller.ts`, `apps/api/src/health.controller.spec.ts`, `apps/api/test/app.e2e-spec.ts`, `apps/web/app/page.tsx`, `apps/web/app/page.spec.tsx`, `apps/web/e2e/home.spec.ts`, `apps/web/playwright.config.ts`
- **Institutional learning:** `docs/zh-Hans/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`, `docs/en/solutions/documentation-gaps/keeping-bilingual-diagram-docs-synchronized-2026-04-09.md`
- **External docs:** `https://tailwindcss.com/docs/installation/framework-guides/nextjs`, `https://tailwindcss.com/docs/functions-and-directives`, `https://tailwindcss.com/docs/detecting-classes-in-source-files`, `https://ui.shadcn.com/docs/installation/manual`, `https://ui.shadcn.com/docs/monorepo`, `https://github.com/tailwindlabs/prettier-plugin-tailwindcss`, `https://github.com/schoero/eslint-plugin-better-tailwindcss`, `https://github.com/francoismassart/eslint-plugin-tailwindcss`, `https://raw.githubusercontent.com/vercel/turborepo/refs/heads/main/skills/turborepo/references/best-practices/RULE.md`
