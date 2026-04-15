import { nestConfig } from "@repo/jest-config";

export default {
  ...nestConfig,
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
