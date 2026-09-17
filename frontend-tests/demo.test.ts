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
    const summary = await demoRequestJson<{
      combined: { income: number };
      walletBreakdown: unknown[];
    }>("/api/summary");
    const categories = await demoRequestJson<{ categories: unknown[] }>(
      "/api/categories?type=expense",
    );

    expect(identity.user.id).toBe("demo-user-1");
    expect(summary.combined.income).toBeGreaterThan(0);
    expect(summary.walletBreakdown.length).toBeGreaterThan(0);
    expect(categories.categories.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mensimulasikan CRUD dan transfer wallet tanpa backend", async () => {
    const initial = await demoRequestJson<{
      wallets: Array<{ id: string; ownerUserId: string; balance: number }>;
      overviews: Array<{
        ownerUserId: string;
        cashBalance: number;
        walletBalance: number;
        unallocatedBalance: number;
      }>;
    }>("/api/wallets");
    const source = initial.wallets.find(
      (wallet) => wallet.ownerUserId === "demo-user-1",
    )!;
    const created = await demoRequestJson<{
      wallet: { id: string; balance: number };
    }>("/api/wallets", {
      method: "POST",
      body: JSON.stringify({
        type: "cash",
        name: "Cash Cadangan",
        initial_balance: 100_000,
      }),
    });

    const beforeAllocation = initial.overviews.find(
      (overview) => overview.ownerUserId === "demo-user-1",
    )!;
    const allocation = await demoRequestJson<{
      overview: { cashBalance: number; unallocatedBalance: number };
    }>("/api/wallets/allocations", {
      method: "POST",
      body: JSON.stringify({
        wallet_id: created.wallet.id,
        direction: "to_wallet",
        amount: 25_000,
        description: "Alokasi demo",
      }),
    });

    await demoRequestJson("/api/wallets/transfer", {
      method: "POST",
      headers: { "Idempotency-Key": "demo-wallet-transfer-1" },
      body: JSON.stringify({
        source_wallet_id: source.id,
        destination_wallet_id: created.wallet.id,
        amount: 50_000,
        transaction_date: "2026-09-17",
      }),
    });
    const updated = await demoRequestJson<{
      wallets: Array<{ id: string; balance: number }>;
    }>("/api/wallets");

    expect(allocation.overview.cashBalance).toBe(beforeAllocation.cashBalance);
    expect(allocation.overview.unallocatedBalance).toBe(
      beforeAllocation.unallocatedBalance - 125_000,
    );
    expect(
      updated.wallets.find((wallet) => wallet.id === created.wallet.id)
        ?.balance,
    ).toBe(175_000);
    const history = await demoRequestJson<{
      allocations: Array<{ description: string | null; amount: number }>;
    }>(`/api/wallets/${created.wallet.id}/allocations`);
    expect(history.allocations).toHaveLength(2);
    expect(history.allocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "Alokasi demo",
          amount: 25_000,
        }),
        expect.objectContaining({ description: null, amount: 100_000 }),
      ]),
    );
    const filtered = await demoRequestJson<{ total: number }>(
      `/api/transactions?wallet=${created.wallet.id}&offset=0`,
    );
    expect(filtered.total).toBe(1);
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

  it("menerapkan pencarian, rentang nominal, dan urutan transaksi", async () => {
    const result = await demoRequestJson<{
      items: Array<{ description: string | null; amount: number }>;
      total: number;
    }>(
      "/api/transactions?search=gaji&min_amount=7000000&max_amount=9000000&sort=amount_asc",
    );

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.description)).toEqual([
      "Gaji bulanan",
      "Gaji bulanan",
    ]);
    expect(result.items.map((item) => item.amount)).toEqual([
      7_200_000, 8_500_000,
    ]);
  });

  it("memutasi saldo tabungan secara lokal", async () => {
    const wallets = await demoRequestJson<{
      wallets: Array<{ id: string; ownerUserId: string; balance: number }>;
    }>("/api/wallets");
    const selectedWallet = wallets.wallets.find(
      (wallet) => wallet.ownerUserId === "demo-user-1",
    )!;
    await demoRequestJson("/api/savings/goals/goal-1/deposits", {
      method: "POST",
      body: JSON.stringify({
        amount: 500_000,
        transaction_date: "2026-09-07",
        wallet_id: selectedWallet.id,
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
    const walletTransactions = await demoRequestJson<{
      items: Array<{ type: string; walletId: string | null }>;
    }>(`/api/transactions?wallet=${selectedWallet.id}`);
    expect(walletTransactions.items).toContainEqual(
      expect.objectContaining({
        type: "saving_deposit",
        walletId: selectedWallet.id,
      }),
    );
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
