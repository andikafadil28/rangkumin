import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  categoryOwnershipGuard,
  reminderCreatorGuard,
  savingsGoalMetadataGuard,
  transactionOwnershipGuard,
} from "../src/middleware/ownership";
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

describe("reminderCreatorGuard", () => {
  it("menolak pasangan mengubah metadata reminder", async () => {
    const environment = {
      APP_ENV: "development",
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ creator_user_id: "user-2" }),
          }),
        }),
      } as unknown as D1Database,
    } as Cloudflare.Env;
    const testApp = new Hono<AppEnv>();
    testApp.use("*", async (context, next) => {
      context.set("currentUser", { id: "user-1", displayName: "User Satu" });
      await next();
    });
    testApp.patch("/reminders/:reminderId", reminderCreatorGuard, (context) =>
      context.json({ updated: true }),
    );

    const response = await testApp.request(
      "/reminders/reminder-1",
      { method: "PATCH" },
      environment,
    );
    expect(response.status).toBe(403);
  });
});

describe("categoryOwnershipGuard", () => {
  it("menolak mutation kategori default", async () => {
    const first = vi
      .fn()
      .mockResolvedValue({ owner_user_id: null, is_default: 1 });
    const database = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({ first }),
      }),
    } as unknown as D1Database;
    const environment = {
      APP_ENV: "development",
      DB: database,
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
      "/categories/:categoryId",
      categoryOwnershipGuard,
      (context) => context.json({ updated: true }),
    );

    const response = await testApp.request(
      "/categories/default-expense-1",
      { method: "PATCH" },
      environment,
    );

    expect(response.status).toBe(403);
  });

  it("mengizinkan pembuat kategori custom", async () => {
    const first = vi
      .fn()
      .mockResolvedValue({ owner_user_id: "user-1", is_default: 0 });
    const environment = {
      APP_ENV: "development",
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({ first }),
        }),
      } as unknown as D1Database,
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
      "/categories/:categoryId",
      categoryOwnershipGuard,
      (context) => context.json({ updated: true }),
    );

    const response = await testApp.request(
      "/categories/custom-1",
      { method: "PATCH" },
      environment,
    );

    expect(response.status).toBe(200);
  });
});

describe("savingsGoalMetadataGuard", () => {
  function createGoalApp(actorUserId: string, creatorUserId: string) {
    const environment = {
      APP_ENV: "development",
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({
              created_by_user_id: creatorUserId,
              ownership_scope: "shared",
              owner_user_id: null,
            }),
          }),
        }),
      } as unknown as D1Database,
    } as Cloudflare.Env;
    const testApp = new Hono<AppEnv>();

    testApp.use("*", async (context, next) => {
      context.set("currentUser", {
        id: actorUserId,
        displayName: "User",
      });
      await next();
    });
    testApp.patch("/savings/:goalId", savingsGoalMetadataGuard, (context) =>
      context.json({ updated: true }),
    );

    return { environment, testApp };
  }

  it("mengizinkan creator mengubah metadata shared goal", async () => {
    const { environment, testApp } = createGoalApp("user-1", "user-1");
    const response = await testApp.request(
      "/savings/shared-1",
      { method: "PATCH" },
      environment,
    );

    expect(response.status).toBe(200);
  });

  it("menolak pasangan mengubah metadata shared goal", async () => {
    const { environment, testApp } = createGoalApp("user-2", "user-1");
    const response = await testApp.request(
      "/savings/shared-1",
      { method: "PATCH" },
      environment,
    );

    expect(response.status).toBe(403);
  });
});
