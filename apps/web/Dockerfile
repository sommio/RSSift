FROM node:24.14.1-bookworm-slim AS builder

ENV API_BASE_URL=http://api:3000
ENV HUSKY=0
ENV NEXT_TELEMETRY_DISABLED=1
ENV PATH="/pnpm:${PATH}"
ENV PNPM_HOME="/pnpm"

RUN corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build

FROM node:24.14.1-bookworm-slim AS runner

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

CMD ["node", "apps/web/server.js"]
