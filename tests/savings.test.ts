import { describe, expect, it } from "vitest";
import { savingsTransferSchema } from "../src/schemas/savings";
import {
  InsufficientBalanceError,
  NotFoundError,
} from "../src/services/errors";
import {
  listSavingsGoals,
  serializeSavingsGoal,
  type SavingsGoalRow,
} from "../src/services/savings-goals";
import {
  depositToSavings,
  getCashBalances,
  transferSavings,
} from "../src/services/savings-mutations";

type StatementResponse = {
  all?: Record<string, unknown>[];
  first?: () => Record<string, unknown> | null;
  changes?: number;
};

function createDatabase(
  resolver: (sql: string) => StatementResponse,
): D1Database & { sql: string[] } {
  const sqlCalls: string[] = [];
  const database = {
    sql: sqlCalls,
    prepare(sql: string) {
      sqlCalls.push(sql);
      const response = resolver(sql);
      const statement = {
        all: async () => ({ results: response.all ?? [] }),
        first: async () => response.first?.() ?? null,
        run: async () => ({ meta: { changes: response.changes ?? 0 } }),
      };
      return { ...statement, bind: () => statement };
    },
  };

  return database as unknown as D1Database & { sql: string[] };
}

function mutationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mutation-1",
    owner_user_id: "user-1",
    type: "saving_transfer",
    source_savings_goal_id: "goal-1",
    destination_savings_goal_id: "goal-2",
    amount: 100000,
    description: null,
    transaction_date: "2026-09-05",
    source: "web",
    idempotency_key: "saving-request-0001",
    created_at: "2026-09-05T00:00:00.000Z",
    source_goal_name: "Darurat",
    destination_goal_name: "Liburan",
    ...overrides,
  };
}

describe("savings goals", () => {
  it("menghitung progress target tanpa membatasi owner saat list", async () => {
    const row: SavingsGoalRow = {
      id: "goal-partner",
      created_by_user_id: "user-2",
      ownership_scope: "personal",
      owner_user_id: "user-2",
      name: "Dana Darurat",
      target_amount: 1000000,
      balance: 250000,
      archived_at: null,
      created_at: "2026-09-05T00:00:00.000Z",
      updated_at: "2026-09-05T00:00:00.000Z",
    };
    const database = createDatabase(() => ({ all: [row] }));

    const goals = await listSavingsGoals(database, {});

    expect(goals[0]).toMatchObject({
      ownerUserId: "user-2",
      balance: 250000,
      progressPercentage: 25,
    });
    expect(database.sql[0]).not.toContain("owner_user_id =");
  });

  it("mengembalikan progress null saat target tidak ada", () => {
    const detail = serializeSavingsGoal({
      id: "goal-1",
      created_by_user_id: "user-1",
      ownership_scope: "personal",
      owner_user_id: "user-1",
      name: "Bebas",
      target_amount: null,
      balance: 0,
      archived_at: null,
      created_at: "2026-09-05T00:00:00.000Z",
      updated_at: "2026-09-05T00:00:00.000Z",
    });

    expect(detail.progressPercentage).toBeNull();
  });
});

describe("savings mutations", () => {
  it("menjalankan transfer sebagai satu conditional INSERT", async () => {
    let keyLookup = 0;
    const database = createDatabase((sql) => {
      if (sql.includes("t.idempotency_key = ?1")) {
        keyLookup += 1;
        return {
          first: () => (keyLookup === 1 ? null : mutationRow()),
        };
      }
      if (sql.includes("INSERT INTO transactions")) return { changes: 1 };
      return {};
    });

    const result = await transferSavings(database, {
      actorUserId: "user-1",
      sourceGoalId: "goal-1",
      destinationGoalId: "goal-2",
      amount: 100000,
      description: null,
      transactionDate: "2026-09-05",
      idempotencyKey: "saving-request-0001",
    });

    expect(result.replayed).toBe(false);
    expect(result.mutation.sourceGoal?.id).toBe("goal-1");
    const insert = database.sql.find((sql) =>
      sql.includes("INSERT INTO transactions"),
    );
    expect(insert).toContain("source_savings_goal_id = ?4");
    expect(insert).toContain("WHERE id = ?5");
    expect(database.sql.filter((sql) => sql.includes("INSERT"))).toHaveLength(
      1,
    );
  });

  it("menolak deposit saat saldo tunai tidak cukup", async () => {
    const database = createDatabase((sql) => {
      if (sql.includes("t.idempotency_key = ?1")) {
        return { first: () => null };
      }
      if (sql.includes("INSERT INTO transactions")) return { changes: 0 };
      if (sql.includes("FROM savings_goals")) {
        return { first: () => ({ id: "goal-shared" }) };
      }
      return {};
    });

    await expect(
      depositToSavings(database, {
        actorUserId: "user-1",
        destinationGoalId: "goal-shared",
        amount: 100000,
        description: null,
        transactionDate: "2026-09-05",
        idempotencyKey: "saving-request-0002",
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
  });

  it("menyembunyikan personal goal pasangan dari mutation", async () => {
    const database = createDatabase((sql) => {
      if (sql.includes("t.idempotency_key = ?1")) {
        return { first: () => null };
      }
      if (sql.includes("INSERT INTO transactions")) return { changes: 0 };
      if (sql.includes("FROM savings_goals")) {
        return { first: () => null };
      }
      return {};
    });

    await expect(
      depositToSavings(database, {
        actorUserId: "user-1",
        destinationGoalId: "goal-user-2",
        amount: 100000,
        description: null,
        transactionDate: "2026-09-05",
        idempotencyKey: "saving-request-0003",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("mengembalikan saldo tunai kedua user untuk read-only view", async () => {
    const database = createDatabase(() => ({
      all: [
        { user_id: "user-1", balance: 500000 },
        { user_id: "user-2", balance: 750000 },
      ],
    }));

    await expect(getCashBalances(database)).resolves.toEqual([
      { userId: "user-1", balance: 500000 },
      { userId: "user-2", balance: 750000 },
    ]);
  });
});

describe("savings schemas", () => {
  it("menolak transfer ke pos yang sama", () => {
    expect(
      savingsTransferSchema.safeParse({
        source_goal_id: "goal-1",
        destination_goal_id: "goal-1",
        amount: 100000,
        transaction_date: "2026-09-05",
      }).success,
    ).toBe(false);
  });
});
