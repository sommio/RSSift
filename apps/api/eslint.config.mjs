import { nestJsConfig } from "@repo/eslint-config/nest-js";

const productionRules = {
  complexity: ["error", 20],
  "max-lines": [
    "error",
    {
      max: 500,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
  "max-lines-per-function": [
    "error",
    {
      max: 100,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
};

const testRules = {
  complexity: "off",
  "max-lines": "off",
  "max-lines-per-function": [
    "error",
    {
      max: 150,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
};

export default [
  ...nestJsConfig,
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.spec.ts", "src/generated/**"],
    rules: productionRules,
  },
  {
    files: ["src/**/*.spec.ts", "test-support/**/*.ts", "e2e/**/*.ts"],
    rules: testRules,
  },
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
