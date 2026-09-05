import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("mengembalikan status layanan", async () => {
    const response = await exports.default.fetch(
      "https://rangkumin.test/api/health",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "rangkumin",
      environment: "development",
      timestamp: expect.any(String),
    });
  });
});

describe("API fallback", () => {
  it("menolak endpoint protected yang tidak dikenal tanpa identity", async () => {
    const response = await exports.default.fetch(
      "https://rangkumin.test/api/tidak-ada",
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
      message: "Identitas Cloudflare Access tidak tersedia.",
    });
  });
});
