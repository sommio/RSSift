/** @jest-environment node */

import { describe, expect, it } from "@jest/globals";

import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns a stable health payload without touching article data", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "web",
      status: "ok",
    });
  });
});
