/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { fileURLToPath } from "node:url";
import { nextJsConfig } from "@repo/eslint-config/next-js";

const cwd = fileURLToPath(new URL(".", import.meta.url));

const logicRules = {
  complexity: ["error", 14],
  "max-lines": [
    "error",
    {
      max: 180,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
  "max-lines-per-function": [
    "error",
    {
      max: 90,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
};

const componentRules = {
  complexity: ["error", 14],
  "max-lines": [
    "error",
    {
      max: 140,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
  "max-lines-per-function": [
    "error",
    {
      max: 90,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
};

const appRouterEntryRules = {
  complexity: ["error", 20],
  "max-lines": [
    "error",
    {
      max: 180,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
  "max-lines-per-function": [
    "error",
    {
      max: 110,
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
      max: 100,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
};

export default [
  ...nextJsConfig,
  {
    files: ["src/**/*.ts"],
    rules: logicRules,
  },
  {
    files: ["src/**/*.tsx"],
    rules: componentRules,
  },
  {
    files: [
      "app/**/{page,layout,loading,error,not-found,template,default}.tsx",
    ],
    rules: appRouterEntryRules,
  },
  {
    files: ["**/*.spec.ts", "**/*.spec.tsx", "e2e/**/*.ts"],
    rules: testRules,
  },
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
      "playwright-report/**",
      "test-results/**",
    ],
  },
];
