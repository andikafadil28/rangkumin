import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { transactionOwnershipGuard } from "../src/middleware/ownership";
import type { AppEnv } from "../src/types";

function createTestApp(ownerUserId: string | null) {
  const first = vi
    .fn()
    .mockResolvedValue(ownerUserId ? { owner_user_id: ownerUserId } : null);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  const environment = {
    APP_ENV: "development",
    DB: { prepare } as unknown as D1Database,
  } as Cloudflare.Env;
  const testApp = new Hono<AppEnv>();

  testApp.use("*", async (context, next) => {
    context.set("currentUser", {
      id: "user-1",
      displayName: "User Satu",
    });
    await next();
  });
  testApp.patch(
    "/transactions/:transactionId",
    transactionOwnershipGuard,
    (context) => context.json({ updated: true }),
  );

  return { bind, environment, prepare, testApp };
}

describe("transactionOwnershipGuard", () => {
  it("mengizinkan pemilik transaksi melanjutkan mutation", async () => {
    const { bind, environment, testApp } = createTestApp("user-1");

    const response = await testApp.request(
      "/transactions/transaction-1",
      { method: "PATCH" },
      environment,
    );

    expect(response.status).toBe(200);
    expect(bind).toHaveBeenCalledWith("transaction-1");
    await expect(response.json()).resolves.toEqual({ updated: true });
  });

  it("menolak mutation transaksi milik pasangan", async () => {
    const { environment, testApp } = createTestApp("user-2");

    const response = await testApp.request(
      "/transactions/transaction-1",
      { method: "PATCH" },
      environment,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Forbidden",
    });
  });

  it("menyembunyikan mutation untuk transaksi yang tidak ditemukan", async () => {
    const { environment, testApp } = createTestApp(null);

    const response = await testApp.request(
      "/transactions/missing",
      { method: "PATCH" },
      environment,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Not Found",
    });
  });

  it("menolak ID terlalu panjang sebelum query D1", async () => {
    const { environment, prepare, testApp } = createTestApp("user-1");

    const response = await testApp.request(
      `/transactions/${"x".repeat(129)}`,
      { method: "PATCH" },
      environment,
    );

    expect(response.status).toBe(404);
    expect(prepare).not.toHaveBeenCalled();
  });
});
