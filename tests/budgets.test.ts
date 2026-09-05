import { describe, expect, it } from "vitest";
import { createBudgetSchema } from "../src/schemas/budget";
import {
  evaluateBudgetAlerts,
  listBudgets,
  updateBudget,
} from "../src/services/budgets";

function databaseForBudget() {
  const binds: unknown[][] = [];
  return {
    binds,
    prepare(sql: string) {
      if (sql.includes("FROM budget_thresholds")) {
        return {
          bind: () => ({
            all: async () => ({
              results: [
                {
                  id: "threshold-1",
                  percentage: 80,
                  notify_web: 1,
                  notify_telegram: 0,
                },
              ],
            }),
          }),
        };
      }
      return {
        bind: (...values: unknown[]) => {
          binds.push(values);
          return {
            all: async () => ({
              results: [
                {
                  id: "budget-1",
                  created_by_user_id: "user-1",
                  ownership_scope: "personal",
                  owner_user_id: "user-1",
                  category_id: "expense-food",
                  category_name: "Makanan",
                  monthly_limit: 1000000,
                  starts_on: "2026-09-01",
                  is_active: 1,
                  spent: 850000,
                },
              ],
            }),
          };
        },
      };
    },
  } as unknown as D1Database & { binds: unknown[][] };
}

describe("budget schemas", () => {
  const base = {
    ownership_scope: "personal",
    category_id: "expense-food",
    monthly_limit: 1000000,
    starts_on: "2026-09-01",
  };

  it("menolak persentase threshold duplikat", () => {
    expect(
      createBudgetSchema.safeParse({
        ...base,
        thresholds: [
          { percentage: 80, notify_web: true, notify_telegram: false },
          { percentage: 80, notify_web: false, notify_telegram: true },
        ],
      }).success,
    ).toBe(false);
  });

  it("menolak threshold tanpa notification channel", () => {
    expect(
      createBudgetSchema.safeParse({
        ...base,
        thresholds: [
          { percentage: 80, notify_web: false, notify_telegram: false },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("listBudgets", () => {
  it("menghitung progress hanya pada batas bulan yang diminta", async () => {
    const database = databaseForBudget();
    const budgets = await listBudgets(database, { period: "2026-09" });

    expect(database.binds[0]).toEqual(["2026-09-01", "2026-09-30"]);
    expect(budgets[0]).toMatchObject({
      spent: 850000,
      remaining: 150000,
      percentage: 85,
    });
  });
});

describe("updateBudget", () => {
  it("mempertahankan ID threshold yang percentage-nya sama", async () => {
    const thresholds = new Map([
      [80, { id: "threshold-80", notifyWeb: 1, notifyTelegram: 0 }],
      [100, { id: "threshold-100", notifyWeb: 1, notifyTelegram: 1 }],
    ]);
    const database = {
      prepare(sql: string) {
        return {
          bind: (...values: unknown[]) => ({
            sql,
            values,
            first: async () => ({ monthly_limit: 1_000_000, is_active: 1 }),
          }),
        };
      },
      async batch(statements: Array<{ sql: string; values: unknown[] }>) {
        for (const statement of statements) {
          if (statement.sql.includes("INSERT INTO budget_thresholds")) {
            const [id, , percentage, notifyWeb, notifyTelegram] =
              statement.values as [string, string, number, number, number];
            const current = thresholds.get(percentage);
            thresholds.set(percentage, {
              id: current?.id ?? id,
              notifyWeb,
              notifyTelegram,
            });
          }
          if (statement.sql.includes("DELETE FROM budget_thresholds")) {
            const retained = new Set(statement.values.slice(1) as number[]);
            for (const percentage of thresholds.keys()) {
              if (!retained.has(percentage)) thresholds.delete(percentage);
            }
          }
        }
        return [];
      },
    } as unknown as D1Database;

    await updateBudget(database, {
      budgetId: "budget-1",
      actorUserId: "user-1",
      thresholds: [
        { percentage: 80, notifyWeb: false, notifyTelegram: true },
        { percentage: 90, notifyWeb: true, notifyTelegram: false },
      ],
    });

    expect([...thresholds.entries()]).toEqual([
      [80, { id: "threshold-80", notifyWeb: 0, notifyTelegram: 1 }],
      [90, { id: expect.any(String), notifyWeb: 1, notifyTelegram: 0 }],
    ]);
  });
});

describe("evaluateBudgetAlerts", () => {
  it("mendeduplikasi notification berdasarkan percentage, bukan threshold ID", async () => {
    let thresholdId = "threshold-before-update";
    const dedupeKeys = new Set<string>();
    const attemptedKeys: string[] = [];
    const database = {
      prepare(sql: string) {
        return {
          bind: (...values: unknown[]) => ({
            all: async () => {
              if (sql.includes("FROM budget_thresholds")) {
                return {
                  results: [
                    {
                      id: thresholdId,
                      percentage: 80,
                      notify_web: 1,
                      notify_telegram: 0,
                    },
                  ],
                };
              }
              return {
                results: [
                  {
                    id: "budget-1",
                    created_by_user_id: "user-1",
                    ownership_scope: "personal",
                    owner_user_id: "user-1",
                    category_id: "expense-food",
                    category_name: "Makanan",
                    monthly_limit: 1_000_000,
                    starts_on: "2026-09-01",
                    is_active: 1,
                    spent: 850_000,
                  },
                ],
              };
            },
            run: async () => {
              const key = values[6] as string;
              attemptedKeys.push(key);
              const changes = dedupeKeys.has(key) ? 0 : 1;
              dedupeKeys.add(key);
              return { meta: { changes } };
            },
          }),
        };
      },
    } as unknown as D1Database;

    expect(await evaluateBudgetAlerts(database, "2026-09")).toBe(1);
    thresholdId = "threshold-after-recreate";
    expect(await evaluateBudgetAlerts(database, "2026-09")).toBe(0);
    expect(attemptedKeys).toEqual([
      "budget:budget-1:2026-09:80:user-1:dashboard",
      "budget:budget-1:2026-09:80:user-1:dashboard",
    ]);
  });
});
