import pluginNext from "@next/eslint-plugin-next";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";

import { baseConfig } from "./base.js";

export const nextJsConfig = [
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@next/next": pluginNext,
      "better-tailwindcss": betterTailwindcss,
      "react-hooks": pluginReactHooks,
    },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
      ...pluginReactHooks.configs.recommended.rules,
      "better-tailwindcss/enforce-consistent-class-order": "error",
      "better-tailwindcss/no-conflicting-classes": "error",
      "better-tailwindcss/no-deprecated-classes": "error",
      "better-tailwindcss/no-duplicate-classes": "error",
      "better-tailwindcss/no-restricted-classes": [
        "error",
        {
          restrict: [
            {
              pattern:
                "^(?:[a-z0-9-]+:)*(?:w|min-w|max-w|grid-cols|text|tracking|rounded|shadow|bg|border|from|via|to|fill|stroke|ring|decoration)-\\[.+\\]$",
              message:
                'Use Tailwind scale tokens or named design tokens instead of arbitrary value "{{0}}".',
            },
          ],
        },
      ],
      "better-tailwindcss/no-unknown-classes": "error",
      "react/react-in-jsx-scope": "off",
    },
  },
];

export default nextJsConfig;
