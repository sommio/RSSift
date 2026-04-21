FROM node:24.14.1-bookworm-slim AS builder

ENV DATABASE_URL=postgresql://rssift:rssift@127.0.0.1:5432/rssift
ENV HUSKY=0
ENV PATH="/pnpm:${PATH}"
ENV PNPM_HOME="/pnpm"

RUN corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter api build

FROM node:24.14.1-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PATH="/pnpm:${PATH}"
ENV PNPM_HOME="/pnpm"
ENV PORT=3000

RUN corepack enable

WORKDIR /app/apps/api

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder /app/turbo.json /app/turbo.json
COPY --from=builder /app/apps/api /app/apps/api

CMD ["node", "dist/src/main.js"]
