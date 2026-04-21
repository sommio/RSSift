# RSSift

<p align="center">
  <a href="./README.md">English</a> · <a href="./README.zh-Hans.md">中文</a>
</p>

[![AI-DECLARATION: copilot](https://img.shields.io/badge/䷼%20AI--DECLARATION-copilot-fee2e2?labelColor=fee2e2)](https://ai-declaration.md)

RSSift 是一款极简的 RSS 摘要阅读器。

专注于优化「打开 -> 扫视摘要与关键点 -> 按需精读」的阅读流程。

通过 LLM 快速提取文章精髓，高效过滤信息，快速判断是否值得投入时间精读原文。

RSSift 通过以下方式工作：

- 用 LLM 预生成翻译标题和分层摘要
- 先呈现一段速览，再给出有序的关键点，方便进一步判断
- 真正想细读时，再跳转到原文继续

v0.1 已实现基础流程，v0.2 计划进一步优化 UI/UX 交互。

![截图](./docs/assets/readme/rssift-reader-v0-1.png)

## 部署

```bash
git clone https://github.com/sommio/RSSift
cd RSSift
cp .env.example .env
```

### 配置

编辑 `.env` 文件，填入你的配置：

- `HTTP_PORT`
  - 作用：Caddy 对宿主机暴露的端口
  - 示例：`80`
- `POSTGRES_DB`
  - 作用：整栈使用的 PostgreSQL 数据库名
  - 示例：`rssift`
- `POSTGRES_USER`
  - 作用：整栈使用的 PostgreSQL 用户名
  - 示例：`rssift`
- `POSTGRES_PASSWORD`
  - 作用：上述数据库用户的密码
  - 示例：`replace-with-a-long-random-password`
- `FEED_OPML_HOST_PATH`
  - 作用：宿主机上 OPML 文件的绝对路径，会只读挂载进 API 容器
  - 示例：`/srv/rssift/feeds.opml`
- `INGEST_ON_BOOT`
  - 作用：容器启动时是否自动执行 feed 拉取
  - 示例：`true`
- `FEED_AUTO_REFRESH_INTERVAL_HOURS`
  - 作用：自动刷新检查之间的最小间隔小时数
  - 示例：`6`
- `FEED_MAX_ARTICLES_PER_FEED`
  - 作用：每次拉取时每个 feed 最多保留的最新文章数
  - 示例：`10`
- `LLM_API_KEY`
  - 作用：OpenAI 兼容网关的 API Key
  - 示例：`sk-...`
- `LLM_BASE_URL`
  - 作用：OpenAI 兼容网关的基础地址
  - 示例：`https://api.openai.com/v1`
- `LLM_MODEL`
  - 作用：生成翻译标题和摘要时使用的模型名
  - 示例：`gpt-4.1-mini`
- `LLM_SUMMARY_CONCURRENCY`
  - 作用：API 同时运行的摘要任务数
  - 示例：`2`
- `LLM_SUMMARY_LANGUAGE`
  - 作用：翻译标题和摘要的目标语言
  - 示例：`zh-CN`
- `LLM_TIMEOUT_MS`
  - 作用：可选的 LLM 请求超时时间，单位毫秒；留空则使用 SDK 默认值
  - 示例：`30000`

### 启动

```bash
docker compose up -d --build
```

### 验证

```bash
docker compose ps
docker compose logs --tail=100 api-migrate api web caddy
curl http://127.0.0.1:${HTTP_PORT:-80}/
curl http://127.0.0.1:${HTTP_PORT:-80}/api/health
```

## 贡献

本仓库使用基于 skills 的 agent-first 开发工作流：

- `ce:brainstorm -> ce:plan -> ce:work -> ce:review -> ce:compound`。

贡献者文档：[`docs/zh-Hans/CONTRIBUTING.md`](./docs/zh-Hans/CONTRIBUTING.md)
