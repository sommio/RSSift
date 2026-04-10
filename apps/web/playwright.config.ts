import { defineConfig, devices } from "@playwright/test";

delete process.env["NO_COLOR"];

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
      command: "pnpm --dir ../api build && pnpm --dir ../api start",
      env: { ...process.env, NO_COLOR: "" },
      url: "http://127.0.0.1:3000/articles",
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
    {
      command: "pnpm build && API_BASE_URL=http://127.0.0.1:3000 pnpm start",
      env: { ...process.env, NO_COLOR: "" },
      url: "http://127.0.0.1:3001",
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
    },
  ],
});
