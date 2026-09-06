import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { categoryRoutes } from "../src/routes/categories";
import {
  transactionQueryRoutes,
  transactionRoutes,
} from "../src/routes/transactions";
import { listCategoriesQuerySchema } from "../src/schemas/category";
import type { TransactionRow } from "../src/services/transactions";
import type { AppBindings, AppEnv } from "../src/types";
import { getCurrentMonthRange } from "../src/utils/date";

type FakeResponse = {
  all?: Record<string, unknown>[];
  first?: Record<string, unknown> | null;
  changes?: number;
};

function createDatabase(
  routes: Array<{ match: (sql: string) => boolean; response: FakeResponse }>,
) {
  return {
    prepare(sql: string) {
      const response = routes.find((route) => route.match(sql))?.response ?? {};
      const statement = {
        all: async () => ({ results: response.all ?? [] }),
        first: async () => response.first ?? null,
        run: async () => ({ meta: { changes: response.changes ?? 0 } }),
      };

      return {
        ...statement,
        bind: () => statement,
      };
    },
  } as unknown as D1Database;
}

function createTestApp(database: D1Database) {
  const testApp = new Hono<AppEnv>();

  testApp.use("*", async (context, next) => {
    context.set("currentUser", {
      id: "user-1",
      displayName: "User Satu",
    });
    await next();
  });
  testApp.route("/transactions", transactionRoutes);
  testApp.route("/", transactionQueryRoutes);
  testApp.route("/categories", categoryRoutes);

  return {
    environment: {
      APP_ENV: "development",
      DB: database,
    } as AppBindings,
    testApp,
  };
}

function transactionRow(): TransactionRow {
  return {
    id: "transaction-1",
    owner_user_id: "user-1",
    type: "expense",
    category_id: "expense-default-1",
    source_savings_goal_id: null,
    destination_savings_goal_id: null,
    amount: 50000,
    description: null,
    transaction_date: "2026-09-05",
    source: "web",
    idempotency_key: "offline-request-0001",
    version: 1,
    deleted_at: null,
    purge_after: null,
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
    category_name: "Makanan & Minuman",
    category_type: "expense",
  };
}

describe("transaction routes", () => {
  it("membuat transaksi dengan Idempotency-Key", async () => {
    const row = transactionRow();
    const database = createDatabase([
      {
        match: (sql) => sql.includes("WHERE idempotency_key = ?1"),
        response: { first: null },
      },
      {
        match: (sql) => sql.includes("FROM categories"),
        response: { first: { id: row.category_id } },
      },
      {
        match: (sql) => sql.includes("INSERT INTO transactions"),
        response: { changes: 1 },
      },
      {
        match: (sql) => sql.includes("FROM transactions t"),
        response: { first: row },
      },
    ]);
    const { environment, testApp } = createTestApp(database);

    const response = await testApp.request(
      "/transactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "offline-request-0001",
          "X-Rangkumin-Actor-Id": "user-1",
        },
        body: JSON.stringify({
          type: "expense",
          amount: 50000,
          transaction_date: "2026-09-05",
          category_id: "expense-default-1",
        }),
      },
      environment,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      transaction: { type: "expense", amount: 50000 },
    });
  });

  it("menolak outbox ketika akun aktif berubah", async () => {
    const { environment, testApp } = createTestApp(createDatabase([]));
    const response = await testApp.request(
      "/transactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "offline-request-actor-mismatch",
          "X-Rangkumin-Actor-Id": "user-2",
        },
        body: JSON.stringify({
          type: "expense",
          amount: 50000,
          transaction_date: "2026-09-05",
          category_id: "expense-default-1",
        }),
      },
      environment,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Actor Mismatch",
    });
  });

  it("menolak create tanpa Idempotency-Key", async () => {
    const { environment, testApp } = createTestApp(createDatabase([]));
    const response = await testApp.request(
      "/transactions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "expense",
          amount: 50000,
          transaction_date: "2026-09-05",
          category_id: "expense-default-1",
        }),
      },
      environment,
    );

    expect(response.status).toBe(400);
  });

  it("menolak filter dengan rentang tanggal terbalik", async () => {
    const { environment, testApp } = createTestApp(createDatabase([]));
    const response = await testApp.request(
      "/transactions?from=2026-09-30&to=2026-09-01",
      {},
      environment,
    );

    expect(response.status).toBe(400);
  });

  it("memakai bulan berjalan Asia/Jakarta untuk summary default", async () => {
    const database = createDatabase([
      {
        match: (sql) => sql.includes("FROM users"),
        response: { all: [{ id: "user-1" }, { id: "user-2" }] },
      },
    ]);
    const { environment, testApp } = createTestApp(database);
    const response = await testApp.request("/summary", {}, environment);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      period: getCurrentMonthRange(),
      combined: { income: 0, expense: 0, net: 0 },
    });
  });

  it("menolak mutation transaksi milik pasangan", async () => {
    const database = createDatabase([
      {
        match: (sql) => sql.includes("SELECT owner_user_id"),
        response: { first: { owner_user_id: "user-2" } },
      },
    ]);
    const { environment, testApp } = createTestApp(database);
    const response = await testApp.request(
      "/transactions/transaction-2",
      { method: "DELETE" },
      environment,
    );

    expect(response.status).toBe(403);
  });
});

describe("category query schema", () => {
  it("membaca inactive=false sebagai false", () => {
    expect(
      listCategoriesQuerySchema.parse({ inactive: "false" }).inactive,
    ).toBe(false);
    expect(listCategoriesQuerySchema.parse({ inactive: "true" }).inactive).toBe(
      true,
    );
  });
});
