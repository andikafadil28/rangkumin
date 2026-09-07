import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  demoRequestJson,
  demoSendWithoutResponse,
  getDemoDashboard,
  resetDemoStore,
} from "../frontend/src/demo";

beforeEach(() => {
  resetDemoStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("demo frontend-only", () => {
  it("melayani dashboard tanpa request jaringan", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("Demo tidak boleh memakai fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    const identity = await demoRequestJson<{ user: { id: string } }>("/api/me");
    const summary = await demoRequestJson<{ combined: { income: number } }>(
      "/api/summary",
    );
    const categories = await demoRequestJson<{ categories: unknown[] }>(
      "/api/categories?type=expense",
    );

    expect(identity.user.id).toBe("demo-user-1");
    expect(summary.combined.income).toBeGreaterThan(0);
    expect(categories.categories.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("menyimpan siklus transaksi hanya sampai store direset", async () => {
    const headers = {
      "Content-Type": "application/json",
      "Idempotency-Key": "demo-request-1",
    };
    const body = JSON.stringify({
      type: "expense",
      amount: 75_000,
      category_id: "expense-food",
      transaction_date: "2026-09-07",
      description: "Kopi sore",
    });

    const first = await demoRequestJson<{ transaction: { id: string } }>(
      "/api/transactions",
      { method: "POST", headers, body },
    );
    const duplicate = await demoRequestJson<{ transaction: { id: string } }>(
      "/api/transactions",
      { method: "POST", headers, body },
    );
    let list = await demoRequestJson<{ items: Array<{ id: string }> }>(
      "/api/transactions?offset=0",
    );

    expect(duplicate.transaction.id).toBe(first.transaction.id);
    expect(list.items.some((item) => item.id === first.transaction.id)).toBe(
      true,
    );

    await demoSendWithoutResponse(
      `/api/transactions/${first.transaction.id}`,
      "DELETE",
    );
    const trash = await demoRequestJson<{ items: Array<{ id: string }> }>(
      "/api/trash?offset=0",
    );
    expect(trash.items.some((item) => item.id === first.transaction.id)).toBe(
      true,
    );

    resetDemoStore();
    list = await demoRequestJson<{ items: Array<{ id: string }> }>(
      "/api/transactions?offset=0",
    );
    expect(list.items.some((item) => item.id === first.transaction.id)).toBe(
      false,
    );
  });

  it("memutasi saldo tabungan secara lokal", async () => {
    await demoRequestJson("/api/savings/goals/goal-1/deposits", {
      method: "POST",
      body: JSON.stringify({
        amount: 500_000,
        transaction_date: "2026-09-07",
      }),
    });
    await demoRequestJson("/api/savings/transfers", {
      method: "POST",
      body: JSON.stringify({
        source_goal_id: "goal-1",
        destination_goal_id: "goal-2",
        amount: 250_000,
        transaction_date: "2026-09-07",
      }),
    });

    const dashboard = getDemoDashboard();
    expect(
      dashboard.savings.goals.find((goal) => goal.id === "goal-1")?.balance,
    ).toBe(38_750_000);
    expect(
      dashboard.savings.goals.find((goal) => goal.id === "goal-2")?.balance,
    ).toBe(9_000_000);
    expect(
      dashboard.savings.cashBalances.find(
        (balance) => balance.userId === "demo-user-1",
      )?.balance,
    ).toBe(6_915_000);
  });

  it("menolak fitur yang sengaja dinonaktifkan", async () => {
    await expect(
      demoRequestJson("/api/receipt-scans", { method: "POST" }),
    ).rejects.toThrow("Scan Struk tidak tersedia");
    await expect(
      demoRequestJson("/api/import/preview", { method: "POST" }),
    ).rejects.toThrow("Import data tidak tersedia");
  });
});
