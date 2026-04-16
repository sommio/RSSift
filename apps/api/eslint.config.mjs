import { nestJsConfig } from "@repo/eslint-config/nest-js";

export default [
  ...nestJsConfig,
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "prisma.config.ts",
      "prisma.test.config.ts",
      "scripts/**",
    ],
  },
];
