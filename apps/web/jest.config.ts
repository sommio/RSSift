import { createNextJestConfig } from '@repo/jest-config/next';

export default createNextJestConfig('./', {
  testMatch: ['<rootDir>/app/**/*.spec.tsx'],
});
