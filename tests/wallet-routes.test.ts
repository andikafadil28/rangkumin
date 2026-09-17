import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { walletRoutes } from "../src/routes/wallets";
import type { WalletRow } from "../src/services/wallets";
import type { AppBindings, AppEnv } from "../src/types";

type StatementResponse = {
  all?: Record<string, unknown>[];
  first?: () => Record<string, unknown> | null;
  changes?: number;
};

type DatabaseCall = { bind: unknown[]; sql: string };

function createDatabase(
  resolver: (sql: string) => StatementResponse,
): D1Database & { calls: DatabaseCall[] } {
  const calls: DatabaseCall[] = [];
  const database = {
    calls,
    prepare(sql: string) {
      const response = resolver(sql);
      const statement = {
        bind(...parameters: unknown[]) {
          calls.push({ bind: parameters, sql });
          return statement;
        },
        all: async () => ({ results: response.all ?? [] }),
        first: async () => response.first?.() ?? null,
        run: async () => ({
          meta: { changes: response.changes ?? 0 },
          success: true,
          results: [],
        }),
      };
      return statement;
    },
    async batch(statements: D1PreparedStatement[]) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
  return database as unknown as D1Database & { calls: DatabaseCall[] };
}

function walletRow(overrides: Partial<WalletRow> = {}): WalletRow {
  return {
    id: "wallet-1",
    owner_user_id: "user-1",
    type: "bank",
    name: "Rekening Utama",
    description: null,
    icon: "bank",
    color: "#3366FF",
    group_name: "bank",
    initial_balance: 500000,
    default_wallet: 1,
    sort_order: 0,
    is_archived: 0,
    archived_at: null,
    balance: 500000,
    created_at: "2026-09-17T00:00:00.000Z",
    updated_at: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

function transferRow() {
  return {
    id: "transfer-1",
    owner_user_id: "user-1",
    source_wallet_id: "wallet-1",
    destination_wallet_id: "wallet-2",
    amount: 100000,
    description: null,
    transaction_date: "2026-09-17",
    source: "web",
    idempotency_key: "wallet-transfer-0001",
    created_at: "2026-09-17T00:00:00.000Z",
    source_wallet_name: "Rekening Utama",
    destination_wallet_name: "GoPay",
  };
}

function createTestApp(database: D1Database) {
  const app = new Hono<AppEnv>();
  app.use("*", async (context, next) => {
    context.set("currentUser", {
      id: "user-1",
      displayName: "User Satu",
    });
    await next();
  });
  app.route("/wallets", walletRoutes);

  return {
    app,
    environment: {
      APP_ENV: "development",
      DB: database,
    } as AppBindings,
  };
}

describe("wallet routes", () => {
  it("menampilkan wallet kedua user untuk read-only view", async () => {
    const database = createDatabase((sql) => ({
      all: sql.includes("FROM users u")
        ? [
            {
              owner_user_id: "user-1",
              cash_balance: 750000,
              wallet_balance: 500000,
            },
            {
              owner_user_id: "user-2",
              cash_balance: 500000,
              wallet_balance: 500000,
            },
          ]
        : [
            walletRow(),
            walletRow({
              id: "wallet-partner",
              owner_user_id: "user-2",
              name: "Cash Pasangan",
              type: "cash",
            }),
          ],
    }));
    const { app, environment } = createTestApp(database);

    const response = await app.request("/wallets", {}, environment);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      wallets: [
        { id: "wallet-1", ownerUserId: "user-1" },
        { id: "wallet-partner", ownerUserId: "user-2" },
      ],
      overviews: [
        { ownerUserId: "user-1", unallocatedBalance: 250000 },
        { ownerUserId: "user-2", unallocatedBalance: 0 },
      ],
    });
  });

  it("tidak menerapkan filter wallet ke overview", async () => {
    const database = createDatabase((sql) => ({
      all: sql.includes("FROM users u")
        ? [
            {
              owner_user_id: "user-2",
              cash_balance: 300000,
              wallet_balance: 100000,
            },
          ]
        : [walletRow()],
    }));
    const { app, environment } = createTestApp(database);
    const response = await app.request(
      "/wallets?owner=user-1",
      {},
      environment,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      wallets: [{ ownerUserId: "user-1" }],
      overviews: [{ ownerUserId: "user-2", unallocatedBalance: 200000 }],
    });
  });

  it("membuat wallet untuk current user", async () => {
    const created = walletRow({ initial_balance: 0 });
    const database = createDatabase((sql) => {
      if (sql.includes("normalized_name = ?2")) {
        return { first: () => null };
      }
      if (sql.includes("WHERE owner_user_id = ?1 AND is_archived = 0")) {
        return { first: () => null };
      }
      if (sql.includes("WHERE w.id = ?1 LIMIT 1")) {
        return { first: () => created };
      }
      return { changes: 1 };
    });
    const { app, environment } = createTestApp(database);

    const response = await app.request(
      "/wallets",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bank",
          name: "Rekening Utama",
          color: "#3366ff",
          initial_balance: 500000,
        }),
      },
      environment,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      wallet: { ownerUserId: "user-1", defaultWallet: true },
    });
    const insert = database.calls.find((call) =>
      call.sql.includes("INSERT INTO wallets"),
    );
    expect(insert?.bind).toContain("user-1");
    expect(
      database.calls.some((call) =>
        call.sql.includes("INSERT INTO wallet_balance_allocations"),
      ),
    ).toBe(true);
  });

  it("membuat alokasi dan mengembalikan wallet serta overview", async () => {
    const database = createDatabase((sql) => {
      if (sql.includes("INSERT INTO wallet_balance_allocations"))
        return { changes: 1 };
      if (sql.includes("SELECT id, owner_user_id") && sql.includes("LIMIT 1")) {
        return {
          first: () => ({
            id: "allocation-1",
            owner_user_id: "user-1",
            wallet_id: "wallet-1",
            direction: "to_wallet",
            amount: 100000,
            description: null,
            created_at: "2026-09-17T00:00:00.000Z",
          }),
        };
      }
      if (sql.includes("FROM users u")) {
        return {
          first: () => ({
            owner_user_id: "user-1",
            cash_balance: 800000,
            wallet_balance: 600000,
          }),
        };
      }
      if (sql.includes("FROM wallets w")) {
        return { first: () => walletRow({ balance: 600000 }) };
      }
      return {};
    });
    const { app, environment } = createTestApp(database);
    const response = await app.request(
      "/wallets/allocations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_id: "wallet-1",
          direction: "to_wallet",
          amount: 100000,
        }),
      },
      environment,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      allocation: { direction: "to_wallet", amount: 100000 },
      wallet: { id: "wallet-1", balance: 600000 },
      overview: { ownerUserId: "user-1", unallocatedBalance: 200000 },
    });
  });

  it("menolak alokasi ke wallet pasangan", async () => {
    const database = createDatabase(() => ({ changes: 0, first: () => null }));
    const { app, environment } = createTestApp(database);
    const response = await app.request(
      "/wallets/allocations",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_id: "wallet-user-2",
          direction: "to_wallet",
          amount: 100000,
        }),
      },
      environment,
    );
    expect(response.status).toBe(404);
  });

  it("menolak payload wallet dengan warna tidak valid", async () => {
    const { app, environment } = createTestApp(createDatabase(() => ({})));
    const response = await app.request(
      "/wallets",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bank",
          name: "Rekening Utama",
          color: "blue",
        }),
      },
      environment,
    );

    expect(response.status).toBe(400);
  });

  it("menyembunyikan wallet pasangan dari mutation", async () => {
    const database = createDatabase((sql) => ({
      first: () => (sql.includes("w.owner_user_id = ?2") ? null : walletRow()),
    }));
    const { app, environment } = createTestApp(database);
    const response = await app.request(
      "/wallets/wallet-partner",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bukan Milikku" }),
      },
      environment,
    );

    expect(response.status).toBe(404);
  });

  it("membuat transfer idempotent lewat endpoint khusus", async () => {
    let keyLookup = 0;
    const database = createDatabase((sql) => {
      if (sql.includes("t.idempotency_key = ?1")) {
        keyLookup += 1;
        return { first: () => (keyLookup === 1 ? null : transferRow()) };
      }
      if (sql.includes("INSERT INTO transactions")) return { changes: 1 };
      return {};
    });
    const { app, environment } = createTestApp(database);

    const response = await app.request(
      "/wallets/transfer",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "wallet-transfer-0001",
        },
        body: JSON.stringify({
          source_wallet_id: "wallet-1",
          destination_wallet_id: "wallet-2",
          amount: 100000,
          transaction_date: "2026-09-17",
        }),
      },
      environment,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      transfer: {
        sourceWallet: { id: "wallet-1" },
        destinationWallet: { id: "wallet-2" },
      },
    });
  });

  it("menolak transfer tanpa idempotency key atau ke wallet yang sama", async () => {
    const { app, environment } = createTestApp(createDatabase(() => ({})));
    const sameWallet = await app.request(
      "/wallets/transfer",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "wallet-transfer-0002",
        },
        body: JSON.stringify({
          source_wallet_id: "wallet-1",
          destination_wallet_id: "wallet-1",
          amount: 100000,
          transaction_date: "2026-09-17",
        }),
      },
      environment,
    );
    expect(sameWallet.status).toBe(400);

    const noKey = await app.request(
      "/wallets/transfer",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_wallet_id: "wallet-1",
          destination_wallet_id: "wallet-2",
          amount: 100000,
          transaction_date: "2026-09-17",
        }),
      },
      environment,
    );
    expect(noKey.status).toBe(400);
  });
});
