import { describe, expect, it } from "vitest";
import { transactionTypeLabel } from "../frontend/src/TransactionsPage";

describe("transaction detail", () => {
  it.each([
    ["income", "Pemasukan"],
    ["expense", "Pengeluaran"],
    ["saving_deposit", "Setoran tabungan"],
    ["saving_withdrawal", "Penarikan tabungan"],
    ["saving_transfer", "Transfer tabungan"],
  ] as const)("memberi label %s yang mudah dibaca", (type, label) => {
    expect(transactionTypeLabel(type)).toBe(label);
  });
});
