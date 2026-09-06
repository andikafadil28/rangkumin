import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("mengembalikan status layanan", { timeout: 15_000 }, async () => {
    const response = await exports.default.fetch(
      "https://rangkumin.test/api/health",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "rangkumin",
      environment: "development",
      timestamp: expect.any(String),
    });
  });
});

describe("API fallback", () => {
  it("menolak list transaksi tanpa identity", async () => {
    const response = await exports.default.fetch(
      "https://rangkumin.test/api/transactions",
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
  });

  it("menjalankan Worker lebih dulu untuk exact /api", async () => {
    const response = await exports.default.fetch("https://rangkumin.test/api");

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });

  it("menolak list tabungan tanpa identity", async () => {
    const response = await exports.default.fetch(
      "https://rangkumin.test/api/savings/goals",
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
  });

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
