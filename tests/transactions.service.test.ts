import { describe, expect, it } from "vitest";
import {
  IdempotencyConflictError,
  InvalidCategoryError,
  NotFoundError,
  VersionConflictError,
} from "../src/services/errors";
import {
  createTransaction,
  listTransactions,
  purgeTransaction,
  softDeleteTransaction,
  summarizeTransactions,
  updateTransaction,
  type TransactionRow,
} from "../src/services/transactions";

type ResponseShape = {
  all?: Record<string, unknown>[];
  first?: Record<string, unknown> | null;
  changes?: number;
};

function createFakeDatabase(
  routes: Array<{ match: (sql: string) => boolean; response: ResponseShape }>,
) {
  const calls: Array<{ bind: unknown[]; sql: string }> = [];

  return {
    calls,
    prepare(sql: string) {
      const route = routes.find((item) => item.match(sql));
      const response = route?.response ?? { all: [], first: null, changes: 0 };

      return {
        bind(...parameters: unknown[]) {
          calls.push({ bind: parameters, sql });
          return {
            all: async () => ({ results: response.all ?? [] }),
            first: async () => response.first ?? null,
            run: async () => ({
              meta: { changes: response.changes ?? 0 },
              success: true,
            }),
          };
        },
        all: async () => ({ results: response.all ?? [] }),
      };
    },
  } as unknown as D1Database & {
    calls: Array<{ bind: unknown[]; sql: string }>;
  };
}

function baseRow(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: "transaction-1",
    owner_user_id: "user-1",
    type: "expense",
    category_id: "expense-default-1",
    source_savings_goal_id: null,
    destination_savings_goal_id: null,
    amount: 50000,
    description: "Makan siang",
    transaction_date: "2026-09-05",
    source: "web",
    idempotency_key: "outbox-2026-09-05-0001",
    version: 1,
    deleted_at: null,
    purge_after: null,
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
    category_name: "Makanan & Minuman",
    category_type: "expense",
    ...overrides,
  };
}

describe("createTransaction", () => {
  it("mengembalikan transaksi yang sama untuk idempotency key berulang", async () => {
    const row = baseRow();
    const database = createFakeDatabase([
      {
        match: (sql) => sql.includes("idempotency_key"),
        response: {
          first: {
            id: row.id,
            owner_user_id: row.owner_user_id,
            type: row.type,
            amount: row.amount,
            category_id: row.category_id,
            transaction_date: row.transaction_date,
            description: row.description,
          },
        },
      },
      {
        match: (sql) => sql.includes("FROM transactions t"),
        response: { first: row },
      },
    ]);

    const result = await createTransaction(database, {
      ownerUserId: "user-1",
      type: "expense",
      amount: row.amount,
      transactionDate: row.transaction_date,
      categoryId: row.category_id!,
      description: row.description,
      source: "web",
      idempotencyKey: row.idempotency_key,
    });

    expect(result.replayed).toBe(true);
    expect(result.transaction.id).toBe(row.id);
    expect(database.calls).toHaveLength(2);
  });

  it("menolak idempotency key yang dipakai payload berbeda", async () => {
    const database = createFakeDatabase([
      {
        match: (sql) => sql.includes("idempotency_key"),
        response: {
          first: {
            id: "transaction-1",
            owner_user_id: "user-1",
            type: "expense",
            amount: 999,
            category_id: "expense-default-1",
            transaction_date: "2026-09-05",
            description: null,
          },
        },
      },
    ]);

    await expect(
      createTransaction(database, {
        ownerUserId: "user-1",
        type: "expense",
        amount: 50000,
        transactionDate: "2026-09-05",
        categoryId: "expense-default-1",
        description: "Makan siang",
        source: "web",
        idempotencyKey: "outbox-2026-09-05-0001",
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("menolak kategori yang tidak cocok dengan jenis transaksi", async () => {
    const database = createFakeDatabase([
      {
        match: (sql) => sql.includes("idempotency_key"),
        response: { first: null },
      },
      { match: () => true, response: { first: null } },
    ]);

    await expect(
      createTransaction(database, {
        ownerUserId: "user-1",
        type: "income",
        amount: 50000,
        transactionDate: "2026-09-05",
        categoryId: "expense-default-1",
        description: null,
        source: "web",
        idempotencyKey: "outbox-2026-09-05-0002",
      }),
    ).rejects.toBeInstanceOf(InvalidCategoryError);
  });
});

describe("updateTransaction", () => {
  it("menolak update saat versi transaksi sudah berubah", async () => {
    const row = baseRow({ version: 2 });
    const database = createFakeDatabase([
      {
        match: (sql) => sql.includes("FROM transactions t"),
        response: { first: row },
      },
    ]);

    await expect(
      updateTransaction(database, {
        id: row.id,
        ownerUserId: "user-1",
        version: 1,
        patch: { amount: 70000 },
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });
});

describe("softDeleteTransaction", () => {
  it("menetapkan deleted_at dan purge_after 30 hari", async () => {
    const database = createFakeDatabase([
      { match: () => true, response: { changes: 1 } },
    ]);

    await softDeleteTransaction(database, "transaction-1");

    const { bind, sql } = database.calls[0]!;
    expect(sql).toContain("deleted_at IS NULL");
    expect(bind[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(bind[1]).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    const diff =
      new Date(bind[1] as string).getTime() -
      new Date(bind[0] as string).getTime();
    expect(diff).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("gagal ketika transaksi sudah tidak aktif", async () => {
    const database = createFakeDatabase([
      { match: () => true, response: { changes: 0 } },
    ]);

    await expect(
      softDeleteTransaction(database, "transaction-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("purgeTransaction", () => {
  it("gagal ketika transaksi tidak ditemukan", async () => {
    const database = createFakeDatabase([
      { match: () => true, response: { changes: 0 } },
    ]);

    await expect(purgeTransaction(database, "missing")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(database.calls[0]!.sql).toContain("deleted_at IS NOT NULL");
  });
});

describe("listTransactions", () => {
  it("menerapkan filter, limit, dan offset", async () => {
    const rows = [baseRow(), baseRow({ id: "transaction-2", amount: 10000 })];
    const database = createFakeDatabase([
      {
        match: (sql) => sql.includes("COUNT(*)"),
        response: { first: { total: 2 } },
      },
      {
        match: (sql) => sql.includes("ORDER BY t.transaction_date DESC"),
        response: { all: rows },
      },
    ]);

    const result = await listTransactions(database, {
      ownerUserId: "user-1",
      type: "expense",
      categoryId: "expense-default-1",
      status: "active",
      limit: 50,
      offset: 0,
    });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.amount).toBe(50000);
    const countSql = database.calls[0]!.sql;
    expect(countSql).toContain("t.deleted_at IS NULL");
    expect(countSql).toContain("t.owner_user_id = ?");
    expect(countSql).toContain("t.type = ?");
    expect(database.calls[1]!.bind).toEqual([
      "user-1",
      "expense",
      "expense-default-1",
      50,
      0,
    ]);
  });
});

describe("summarizeTransactions", () => {
  it("menggabungkan ringkasan per user dan gabungan", async () => {
    const database = createFakeDatabase([
      {
        match: (sql) => sql.includes("GROUP BY t.owner_user_id, t.type"),
        response: {
          all: [
            {
              owner_user_id: "user-1",
              type: "income",
              total: 6000000,
              count: 2,
            },
            {
              owner_user_id: "user-1",
              type: "expense",
              total: 1500000,
              count: 3,
            },
            {
              owner_user_id: "user-2",
              type: "income",
              total: 4000000,
              count: 1,
            },
          ],
        },
      },
      {
        match: (sql) => sql.includes("JOIN categories"),
        response: {
          all: [
            {
              id: "expense-default-1",
              name: "Makanan & Minuman",
              type: "expense",
              total: 1500000,
              count: 3,
            },
            {
              id: "income-default-1",
              name: "Gaji",
              type: "income",
              total: 10000000,
              count: 3,
            },
          ],
        },
      },
      {
        match: (sql) => sql.includes("FROM users"),
        response: { all: [{ id: "user-1" }, { id: "user-2" }] },
      },
    ]);

    const result = await summarizeTransactions(database, {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });

    expect(result.byUser).toEqual([
      {
        userId: "user-1",
        income: 6000000,
        incomeCount: 2,
        expense: 1500000,
        expenseCount: 3,
        net: 4500000,
      },
      {
        userId: "user-2",
        income: 4000000,
        incomeCount: 1,
        expense: 0,
        expenseCount: 0,
        net: 4000000,
      },
    ]);
    expect(result.combined.income).toBe(10000000);
    expect(result.combined.expense).toBe(1500000);
    expect(result.combined.net).toBe(8500000);
    expect(result.combined.categories).toHaveLength(2);
  });
});
