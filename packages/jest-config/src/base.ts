import type { Config } from 'jest';

export const baseConfig = {
  clearMocks: true,
  coverageProvider: 'v8',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/dist/'],
} as const satisfies Config;

export default baseConfig;
