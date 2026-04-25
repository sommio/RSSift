import { defineConfig } from "orval";

export default defineConfig({
  api: {
    input: {
      target: "./openapi/openapi.yaml",
    },
    output: {
      baseUrl: "/",
      client: "fetch",
      mode: "single",
      target: "./src/generated/api-client.ts",
    },
  },
});
