import { fileURLToPath } from "node:url";
import { nextJsConfig } from "@repo/eslint-config/next-js";

const cwd = fileURLToPath(new URL(".", import.meta.url));

export default [
  ...nextJsConfig,
  {
    files: ["**/*.{ts,tsx}"],
    settings: {
      "better-tailwindcss": {
        cwd,
        entryPoint: "./app/globals.css",
      },
    },
  },
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "eslint.config.mjs",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];
