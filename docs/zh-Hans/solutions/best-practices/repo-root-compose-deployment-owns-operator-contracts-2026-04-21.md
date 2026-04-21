---
title: 让自托管 Docker Compose 部署在 repo 根保持 operator-owned 契约
date: 2026-04-21
category: best-practices
module: vps deployment
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - 在这个 monorepo 中新增自托管 Docker Compose 部署路径时
  - 判断部署文件应该放在 repo 根还是某个 app 内时
  - 为 web、api、postgres 串联健康检查与启动顺序时
  - 澄清哪些运行时输入属于 operator，哪些属于 app 本地开发时
  - 需要把首版部署路径明确收窄成 HTTP-only 反向代理时
tags:
  [
    docker,
    compose,
    caddy,
    deployment,
    vps,
    health-checks,
    monorepo,
    operator-contract,
  ]
---

# 让自托管 Docker Compose 部署在 repo 根保持 operator-owned 契约

## Context

这个仓库新增了一条 VPS / 自托管 Docker Compose 部署路径，同时必须守住两层边界：Turborepo 的 app ownership，以及面向 operator 的部署入口清晰度。

真正危险的失败模式，是把这两层边界揉在一起。如果把部署主入口塞进某个 app，operator 就得先理解某个 app 的局部入口，才能拉起跨 app 的整栈。如果把 app 本地开发 env 直接复用成生产契约，部署路径又会悄悄继承只适合开发机的默认假设。同一轮工作里的后续修正再次暴露了这种漂移：最初的 Caddy 契约暗示了 hostname/TLS 可配置，但真实需求其实只是更简单的 HTTP-only 反向代理。

## Guidance

把 repo 根视为自托管部署的唯一 operator 入口，同时让 app-specific build logic 继续留在各自 app 内。

在这个仓库里，具体做法是：

- repo 根拥有 `compose.yaml`、根 `.env`、`.env.example` 与 `Caddyfile`
- `apps/api` 与 `apps/web` 继续拥有自己的 Dockerfile 和 package-local 运行时细节
- `compose.yaml` 用 repo 根 build context 构建镜像，但 `dockerfile` 指向 app 内部文件
- 只有 `caddy` 发布宿主机端口；`postgres`、`api-migrate`、`api`、`web` 都留在 Compose 内网
- 启动顺序必须由健康状态串起来：`postgres` -> `api-migrate` -> `api` -> `web` -> `caddy`
- 健康探针面要显式且轻量：`api` 提供 `/health/live` 与 `/health/ready`，`web` 提供 `/api/health`
- 首版部署契约要刻意收窄：Caddy 监听 `:80`，只把流量反代到 `web:3001`，不提前引入 domain 或 TLS 配置

operator-owned 输入要和 app 本地开发默认值分开。根 `.env.example` 应只描述 operator 在部署时真正拥有的值，比如 `HTTP_PORT`、`POSTGRES_*`、`FEED_OPML_HOST_PATH`、`INGEST_ON_BOOT`、`LLM_*`。像 `apps/api/.env.local`、`apps/web/.env.local` 这样的文件，仍然只是本地开发资产，不应被提升成生产契约。

还要用 root contract test 锁住这套拓扑。在这次改动里，`.github/scripts/compose-contract.test.mjs` 会验证服务拓扑、app-local Dockerfile ownership、host port 暴露边界、health-gated 依赖、精确镜像 pin，以及首版部署模式里刻意不存在的 `HTTPS_PORT` / `CADDY_SITE_ADDRESS`。

## Why This Matters

这个模式主要避免两类漂移。

第一类，是 monorepo 边界漂移。web 和 API package 仍然拥有自己的镜像构建方式，repo 根只拥有真正跨 app 的编排层。这样不会为了部署而把 package 的职责塌缩到根目录。

第二类，是部署契约漂移。后续把 Caddy 收窄成 HTTP-only 很关键，因为 domain/TLS 占位符会让首版 rollout 看起来比真实能力更“通用”。当部署文档、env 模板和 contract test 一起表达同一个更窄但更真实的契约时，operator 获得的是一个稳定心智模型，而不是几份彼此半重叠的说法。

显式健康链还能阻止过早启动。Caddy 不应该把流量转给一个还没等到 API 就绪的 web 容器；API 也不应该在 migration 完成前、数据库仍不可达时就宣称自己 ready。专门的 probe route 能把这些状态暴露出来，而不是拿业务页面充当探针。

## When to Apply

- 在这个 monorepo 里新增跨多个 app 的 repo-wide 部署路径时
- 判断根配置描述的是 operator 输入还是 developer 输入时
- 给容器编排引入 reverse proxy 与 health checks 时
- 首版部署模式需要刻意比未来托管能力更收敛时
- 需要把部署不变量写进文档或测试，防止后续漂移时

## Examples

repo 根负责编排，app 保留镜像实现 ownership：

```yaml
services:
  api:
    build:
      context: .
      dockerfile: ./apps/api/Dockerfile
  web:
    build:
      context: .
      dockerfile: ./apps/web/Dockerfile
  caddy:
    ports:
      - "${HTTP_PORT:-80}:80"
```

显式 health-gated 启动链：

```yaml
api:
  depends_on:
    postgres:
      condition: service_healthy
    api-migrate:
      condition: service_completed_successfully
web:
  depends_on:
    api:
      condition: service_healthy
caddy:
  depends_on:
    web:
      condition: service_healthy
```

不要探测业务页面，改用专用健康端点：

```ts
// apps/api/src/health/health.controller.ts
@Get("ready")
async ready(@Res({ passthrough: true }) response: Response) {
  await this.prisma.$queryRawUnsafe("SELECT 1");
  return { service: "api", status: "ok" };
}
```

```ts
// apps/web/app/api/health/route.ts
export function GET() {
  return NextResponse.json({ service: "web", status: "ok" });
}
```

Caddy 的首版部署契约要收窄：

```caddyfile
:80 {
  encode gzip zstd
  reverse_proxy web:3001
}
```

而 contract test 要把这个边界锁住：

```js
assert.doesNotMatch(caddyBlock, /HTTPS_PORT|CADDY_SITE_ADDRESS/);
```

## Related

- `compose.yaml`
- `Caddyfile`
- `.env.example`
- `.github/scripts/compose-contract.test.mjs`
- `apps/api/src/health/health.controller.ts`
- `apps/web/app/api/health/route.ts`
- `README.md`
- `README.zh-Hans.md`
- `docs/en/plans/2026-04-21-001-feat-docker-images-vps-compose-plan.md`
- `docs/zh-Hans/plans/2026-04-21-001-feat-docker-images-vps-compose-plan.md`
- `docs/zh-Hans/solutions/integration-issues/ci-e2e-runtime-inputs-must-match-seeded-targets-2026-04-16.md`
