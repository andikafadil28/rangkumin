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
  it("mengembalikan JSON 404 untuk endpoint yang tidak tersedia", async () => {
    const response = await exports.default.fetch(
      "https://rangkumin.test/api/tidak-ada",
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Not Found",
      message: "Endpoint API tidak ditemukan.",
    });
  });
});
