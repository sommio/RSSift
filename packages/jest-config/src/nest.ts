import type { Config } from 'jest';

import { baseConfig } from './base.js';

export const nestConfig = {
  ...baseConfig,
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
} as const satisfies Config;

export default nestConfig;
