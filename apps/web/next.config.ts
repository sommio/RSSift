import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import type { NextConfig } from "next";

const workspaceRoot = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);

const baseConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  transpilePackages: ["@repo/ui"],
} satisfies NextConfig;

export default function nextConfig(phase: string): NextConfig {
  // Keep Turbopack dev rooted at the app package. Next 16 can mis-resolve
  // Tailwind CSS imports in monorepos when outputFileTracingRoot is reused there.
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return baseConfig;
  }

  return {
    ...baseConfig,
    outputFileTracingRoot: workspaceRoot,
  };
}
