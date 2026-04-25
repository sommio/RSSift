import { describe, expect, it } from "@jest/globals";
import { resolve } from "node:path";

import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants";

import nextConfig from "../next.config";

describe("web next config", () => {
  it("keeps Turbopack dev rooted at the app package", () => {
    const config = nextConfig(PHASE_DEVELOPMENT_SERVER);

    expect(config.allowedDevOrigins).toEqual(["127.0.0.1"]);
    expect(config.output).toBe("standalone");
    expect(config.outputFileTracingRoot).toBeUndefined();
    expect(config.transpilePackages).toEqual([
      "@repo/api-contract",
      "@repo/ui",
    ]);
  });

  it("keeps monorepo tracing enabled outside the dev server", () => {
    const config = nextConfig(PHASE_PRODUCTION_BUILD);

    expect(config.outputFileTracingRoot).toBe(resolve(process.cwd(), "../.."));
    expect(config.transpilePackages).toEqual([
      "@repo/api-contract",
      "@repo/ui",
    ]);
  });
});
