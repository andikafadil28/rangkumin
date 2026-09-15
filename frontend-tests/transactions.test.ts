import { describe, expect, it } from "vitest";
import {
  transactionTypeLabel,
  validateTransactionFilterRange,
} from "../frontend/src/TransactionsPage";

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

describe("transaction filters", () => {
  const valid = {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-30",
    minAmount: "10000",
    maxAmount: "500000",
  };

  it("menerima rentang tanggal dan nominal yang valid", () => {
    expect(validateTransactionFilterRange(valid)).toBeNull();
  });

  it("menolak rentang terbalik dan nominal bukan integer positif", () => {
    expect(
      validateTransactionFilterRange({
        ...valid,
        dateFrom: "2026-10-01",
      }),
    ).toContain("Tanggal akhir");
    expect(
      validateTransactionFilterRange({ ...valid, minAmount: "0" }),
    ).toContain("angka bulat");
    expect(
      validateTransactionFilterRange({ ...valid, minAmount: "600000" }),
    ).toContain("Nominal maksimum");
  });
});
