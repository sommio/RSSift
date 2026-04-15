import { loadEnvFile } from "node:process";

import { defineConfig, env } from "prisma/config";

loadEnvFile(".env.local");

export default defineConfig({
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
