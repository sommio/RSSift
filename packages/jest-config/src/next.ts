import type { Config } from "jest";
import nextJestFactory from "next/jest.js";

import { baseConfig } from "./base.js";

type NextJestFactory = (options: {
  dir: string;
}) => (config: Config) => Config | Promise<Config>;

const nextJest = nextJestFactory as unknown as NextJestFactory;

export function createNextJestConfig(
  dir: string,
  overrides: Config = {},
): Config | Promise<Config> {
  const createJestConfig = nextJest({ dir });

  return createJestConfig({
    ...baseConfig,
    testEnvironment: "jsdom",
    ...overrides,
  });
}
