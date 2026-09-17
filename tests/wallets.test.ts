import { describe, expect, it } from "vitest";
import {
  ConflictError,
  IdempotencyConflictError,
  InsufficientBalanceError,
  NotFoundError,
} from "../src/services/errors";
import {
  archiveWallet,
  createWallet,
  deleteWallet,
  getWalletBalance,
  listWallets,
  serializeWallet,
  setDefaultWallet,
  transferBetweenWallets,
  type WalletRow,
} from "../src/services/wallets";

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
      let parameters: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          parameters = values;
          calls.push({ bind: values, sql });
          return statement;
        },
        all: async () => ({ results: response.all ?? [] }),
        first: async () => response.first?.() ?? null,
        run: async () => ({
          meta: { changes: response.changes ?? 0 },
          success: true,
          results: [],
          bind: parameters,
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
    description: "Rekening gaji",
    icon: "bank",
    color: "#3366FF",
    group_name: "bank",
    initial_balance: 500000,
    default_wallet: 1,
    sort_order: 0,
    is_archived: 0,
    archived_at: null,
    balance: 750000,
    created_at: "2026-09-17T00:00:00.000Z",
    updated_at: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

function transferRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "transfer-1",
    owner_user_id: "user-1",
    source_wallet_id: "wallet-1",
    destination_wallet_id: "wallet-2",
    amount: 100000,
    description: "Isi e-wallet",
    transaction_date: "2026-09-17",
    source: "web",
    idempotency_key: "wallet-transfer-0001",
    created_at: "2026-09-17T00:00:00.000Z",
    source_wallet_name: "Rekening Utama",
    destination_wallet_name: "GoPay",
    ...overrides,
  };
}

describe("wallet queries", () => {
  it("memetakan row dan menghitung saldo dari seluruh mutasi wallet", async () => {
    const row = walletRow();
    const database = createDatabase(() => ({ all: [row] }));

    const wallets = await listWallets(database);

    expect(wallets).toEqual([serializeWallet(row)]);
    expect(wallets[0]).toMatchObject({
      defaultWallet: true,
      initialBalance: 500000,
      balance: 750000,
    });
    expect(database.calls[0]!.sql).toContain("t.type = 'income'");
    expect(database.calls[0]!.sql).toContain("t.type = 'wallet_transfer'");
    expect(database.calls[0]!.sql).toContain("t.deleted_at IS NULL");
  });

  it("mengembalikan saldo terhitung dan 404 untuk wallet yang tidak ada", async () => {
    const found = createDatabase(() => ({
      first: () => ({ balance: 125000 }),
    }));
    await expect(getWalletBalance(found, "wallet-1")).resolves.toBe(125000);

    const missing = createDatabase(() => ({ first: () => null }));
    await expect(getWalletBalance(missing, "missing")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("wallet mutations", () => {
  it("membuat wallet pertama sebagai default dan menormalkan metadata", async () => {
    const created = walletRow({
      name: "Rekening Utama",
      description: "Rekening gaji",
      color: "#AABBCC",
    });
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

    const wallet = await createWallet(database, {
      ownerUserId: "user-1",
      type: "bank",
      name: "  Rekening   Utama ",
      description: "  Rekening   gaji ",
      color: "#aabbcc",
      initialBalance: 500000,
    });

    expect(wallet.defaultWallet).toBe(true);
    const insert = database.calls.find((call) =>
      call.sql.includes("INSERT INTO wallets"),
    );
    expect(insert?.bind).toContain("rekening utama");
    expect(insert?.bind).toContain("#AABBCC");
    expect(insert?.bind).toContain(1);
  });

  it("menolak archive pada default wallet", async () => {
    const database = createDatabase((sql) => ({
      first: () => (sql.includes("FROM wallets w") ? walletRow() : null),
    }));

    await expect(
      archiveWallet(database, {
        walletId: "wallet-1",
        ownerUserId: "user-1",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("mengganti default wallet dengan batch atomik", async () => {
    const current = walletRow({ default_wallet: 0 });
    const updated = walletRow({ default_wallet: 1 });
    let walletLookup = 0;
    const database = createDatabase((sql) => {
      if (sql.includes("FROM wallets w")) {
        walletLookup += 1;
        return { first: () => (walletLookup === 1 ? current : updated) };
      }
      return { changes: 1 };
    });

    const result = await setDefaultWallet(database, {
      walletId: "wallet-1",
      ownerUserId: "user-1",
    });

    expect(result.defaultWallet).toBe(true);
    expect(
      database.calls.some((call) => call.sql.includes("default_wallet = 0")),
    ).toBe(true);
    expect(
      database.calls.some((call) => call.sql.includes("default_wallet = 1")),
    ).toBe(true);
  });

  it("menolak hard delete jika wallet punya saldo atau transaksi", async () => {
    const database = createDatabase((sql) => {
      if (sql.includes("FROM wallets w")) {
        return { first: () => walletRow({ default_wallet: 0 }) };
      }
      if (sql.includes("COUNT(*) AS total")) {
        return { first: () => ({ total: 1 }) };
      }
      return {};
    });

    await expect(
      deleteWallet(database, {
        walletId: "wallet-1",
        ownerUserId: "user-1",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("wallet transfers", () => {
  it("membuat transfer sebagai satu conditional insert yang cash-neutral", async () => {
    let keyLookup = 0;
    const database = createDatabase((sql) => {
      if (sql.includes("t.idempotency_key = ?1")) {
        keyLookup += 1;
        return { first: () => (keyLookup === 1 ? null : transferRow()) };
      }
      if (sql.includes("INSERT INTO transactions")) return { changes: 1 };
      return {};
    });

    const result = await transferBetweenWallets(database, {
      actorUserId: "user-1",
      sourceWalletId: "wallet-1",
      destinationWalletId: "wallet-2",
      amount: 100000,
      description: "  Isi   e-wallet ",
      transactionDate: "2026-09-17",
      idempotencyKey: "wallet-transfer-0001",
    });

    expect(result.replayed).toBe(false);
    expect(result.transfer.sourceWallet.id).toBe("wallet-1");
    expect(result.transfer.destinationWallet.id).toBe("wallet-2");
    const inserts = database.calls.filter((call) =>
      call.sql.includes("INSERT INTO transactions"),
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.sql).toContain("'wallet_transfer'");
    expect(inserts[0]!.sql).toContain("source_wallet_id");
    expect(inserts[0]!.sql).toContain("destination_wallet_id");
    expect(inserts[0]!.sql).toContain("initial_balance");
  });

  it("menolak replay idempotency dengan payload berbeda", async () => {
    const database = createDatabase((sql) => ({
      first: () =>
        sql.includes("t.idempotency_key = ?1") ? transferRow() : null,
    }));

    await expect(
      transferBetweenWallets(database, {
        actorUserId: "user-1",
        sourceWalletId: "wallet-1",
        destinationWalletId: "wallet-2",
        amount: 200000,
        description: "Isi e-wallet",
        transactionDate: "2026-09-17",
        idempotencyKey: "wallet-transfer-0001",
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("menolak key yang sudah dipakai tipe transaksi lain", async () => {
    let transferLookup = 0;
    const database = createDatabase((sql) => {
      if (sql.includes("t.idempotency_key = ?1")) {
        transferLookup += 1;
        return { first: () => null };
      }
      if (sql.includes("INSERT INTO transactions")) return { changes: 0 };
      if (sql.includes("SELECT id FROM transactions")) {
        return { first: () => ({ id: "income-1" }) };
      }
      return {};
    });

    await expect(
      transferBetweenWallets(database, {
        actorUserId: "user-1",
        sourceWalletId: "wallet-1",
        destinationWalletId: "wallet-2",
        amount: 100000,
        description: null,
        transactionDate: "2026-09-17",
        idempotencyKey: "existing-income-key",
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(transferLookup).toBe(2);
  });

  it("membedakan wallet tidak ditemukan dan saldo tidak cukup", async () => {
    const missingDatabase = createDatabase((sql) => {
      if (sql.includes("t.idempotency_key = ?1")) {
        return { first: () => null };
      }
      if (sql.includes("INSERT INTO transactions")) return { changes: 0 };
      if (sql.includes("SELECT id FROM wallets")) {
        return { first: () => null };
      }
      return {};
    });
    await expect(
      transferBetweenWallets(missingDatabase, {
        actorUserId: "user-1",
        sourceWalletId: "wallet-other-user",
        destinationWalletId: "wallet-2",
        amount: 100000,
        description: null,
        transactionDate: "2026-09-17",
        idempotencyKey: "wallet-transfer-0002",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const insufficientDatabase = createDatabase((sql) => {
      if (sql.includes("t.idempotency_key = ?1")) {
        return { first: () => null };
      }
      if (sql.includes("INSERT INTO transactions")) return { changes: 0 };
      if (sql.includes("SELECT id FROM wallets")) {
        return { first: () => ({ id: "wallet" }) };
      }
      return {};
    });
    await expect(
      transferBetweenWallets(insufficientDatabase, {
        actorUserId: "user-1",
        sourceWalletId: "wallet-1",
        destinationWalletId: "wallet-2",
        amount: 100000,
        description: null,
        transactionDate: "2026-09-17",
        idempotencyKey: "wallet-transfer-0003",
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
  });
});
