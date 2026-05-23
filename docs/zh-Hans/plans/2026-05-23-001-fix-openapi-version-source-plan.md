---
title: "fix: 根目录 package.json 作为 OpenAPI 唯一版本来源"
type: fix
status: completed
date: 2026-05-23
---

# fix: 根目录 package.json 作为 OpenAPI 唯一版本来源

## 概述

CI `openapi-contract.e2e-spec.ts` 失败，原因：commit `6e0dffc` 移除了 `openapi-document.ts` 中的 `.setVersion("0.1.0")`，Swagger 默认回退到 `1.0.0`，而 checked-in 的 `openapi.yaml` 仍是 `0.1.0`。修复：从根目录 `package.json` 读取版本，单一来源。

## 问题框架

- 运行时 `createOpenApiDocument()` 输出 `info.version: "1.0.0"`（Swagger 默认值）
- Checked-in `openapi.yaml` 为 `info.version: "0.1.0"`
- E2e 深比较失败
- 用户需求：根目录 `package.json` 作为唯一版本来源

## 需求追溯

- R1. E2e contract 测试通过
- R2. 版本只在一处定义（根目录 `package.json`）
- R3. `contract:refresh` 重新生成 `openapi.yaml` 时版本正确

## 范围边界

- 不修改 e2e 测试逻辑
- 不修改 contract refresh 工作流（版本来源除外）

## 上下文与研究

### 相关代码与模式

- `apps/api/src/openapi/openapi-document.ts` — 构建 OpenAPI doc，缺少 `.setVersion()`
- `apps/api/src/openapi/openapi-refresh.ts` — 从 `createOpenApiDocument()` 重新生成 `openapi.yaml`
- `packages/api-contract/openapi/openapi.yaml` — checked-in contract，`version: 0.1.0`
- `package.json`（根目录）— `version: "0.1.0"`

## 关键技术决策

- **运行时从根目录 `package.json` 读取版本：** NestJS `DocumentBuilder.setVersion()` 接受字符串。使用 `node:path` 相对遍历读取 `package.json`。无需额外依赖。

## 实施单元

- [x] **单元 1：openapi-document.ts 从 package.json 读取版本**

**目标：** `createOpenApiDocument()` 读取根目录 `package.json` 版本并调用 `.setVersion()`

**需求：** R1, R2

**依赖：** 无

**文件：**

- 修改：`apps/api/src/openapi/openapi-document.ts`

**方案：**

- 从 `node:fs` 导入 `readFileSync`，从 `node:path` 导入 `resolve`
- 相对 `__dirname` 读取 `../../../../package.json`
- 解析 JSON，提取 `.version`
- 在 DocumentBuilder `.build()` 前链式调用 `.setVersion(version)`

**测试场景：**

- 正常路径：输出的 document `info.version` 等于根目录 `package.json` 版本
- 集成：e2e 测试 `openapi-contract.e2e-spec.ts` 通过（输出等于 checked-in）

**验证：**

- `apps/api` 中 `pnpm test:e2e` 通过

- [x] **单元 2：重新生成 openapi.yaml**

**目标：** Checked-in contract 反映新版本来源

**需求：** R3

**依赖：** 单元 1

**文件：**

- 重新生成：`packages/api-contract/openapi/openapi.yaml`

**方案：**

- 从仓库根目录运行 `pnpm contract:refresh`
- 提交更新后的 `openapi.yaml`

**测试场景：**

- 正常路径：`openapi.yaml` 的 `info.version` 与根目录 `package.json` 版本一致

**验证：**

- `openapi.yaml` 的 `info.version` 为 `0.1.0`（与根目录 `package.json` 一致）

## 风险与依赖

| 风险                                                               | 缓解措施                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 根目录 `package.json` 路径解析在不同上下文（测试 vs 运行时）中失败 | 使用 `__dirname` 相对遍历，与 `openapi-refresh.ts` 已有的 contract 路径模式一致 |
