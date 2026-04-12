import { createNextJestConfig } from "@repo/jest-config/next";

export default createNextJestConfig("./", {
  testMatch: ["<rootDir>/app/**/*.spec.tsx"],
  moduleNameMapper: {
    // Keep direct Jest runs independent from `packages/ui/dist` bootstrap state.
    "^@repo/ui$": "<rootDir>/../../packages/ui/src/index.ts",
    "^@repo/ui/(.*)$": "<rootDir>/../../packages/ui/src/$1",
  },
});
