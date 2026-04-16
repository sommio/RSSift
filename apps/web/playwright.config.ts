import { defineConfig, devices } from "@playwright/test";

delete process.env["NO_COLOR"];

const apiRuntimeEnv = {
  ...process.env,
  DATABASE_URL:
    process.env["TEST_DATABASE_URL"] ??
    process.env["DATABASE_URL"] ??
    "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test",
  TEST_DATABASE_URL:
    process.env["TEST_DATABASE_URL"] ??
    "postgresql://rssift:rssift@127.0.0.1:5432/rssift_test",
  INGEST_ON_BOOT: "false",
  NO_COLOR: "",
};

const webRuntimeEnv = {
  ...process.env,
  API_BASE_URL: process.env["API_BASE_URL"] ?? "http://127.0.0.1:3000",
  NO_COLOR: "",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: [
    {
      command:
        "pnpm --dir ../api build && pnpm --dir ../api exec prisma migrate reset --config ./prisma.test.config.ts --force && pnpm --dir ../api exec prisma db execute --config ./prisma.test.config.ts --file ./prisma/seed/seed.sql && INGEST_ON_BOOT=false pnpm --dir ../api start:prod",
      env: apiRuntimeEnv,
      url: "http://127.0.0.1:3000/articles",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "pnpm build && pnpm start",
      env: webRuntimeEnv,
      url: "http://127.0.0.1:3001",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
