# API (First Vertical Slice)

This app exposes the first fixture-backed read-path slice for prepared articles.

## Local Run

```bash
pnpm --filter api dev
```

The API runs on `http://127.0.0.1:3000` by default.

## Endpoints

- `GET /articles`
  - Returns article list items with fields:
    - `id`
    - `title`
    - `sourceTitle`
    - `publishedAt`
    - `originalUrl`
- `GET /articles/:id`
  - Returns article detail with fields:
    - `title`
    - `sourceTitle`
    - `publishedAt`
    - `summary`
    - `originalUrl`
  - Returns `404` for unknown article IDs.

## Validation

```bash
pnpm --filter api test
pnpm --filter api test:e2e
```
