import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import globals from "globals";
import tseslint from "typescript-eslint";

export const baseConfig = defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "apps/api/src/generated/**",
      "packages/api-contract/src/generated/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ["**/*.{ts,tsx,cts,mts,js,jsx,cjs,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "*.js",
            "*.mjs",
            ".github/scripts/*.mjs",
            ".github/scripts/*.test.mjs",
            "orval.config.ts",
            "packages/api-contract/orval.config.ts",
          ],
        },
      },
    },
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false } },
      ],
    },
  },
  {
    files: [".github/scripts/**/*.mjs"],
    rules: {
      "turbo/no-undeclared-env-vars": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
    },
  },
  eslintConfigPrettier,
);

export default baseConfig;
