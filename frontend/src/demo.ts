import type { getDashboard } from "./api";

export const demoDashboard: Awaited<ReturnType<typeof getDashboard>> = {
  user: { id: "demo-user-1", displayName: "Ari" },
  summary: {
    period: { from: "2026-09-01", to: "2026-09-30" },
    byUser: [
      {
        userId: "demo-user-1",
        income: 8_500_000,
        expense: 3_240_000,
        net: 5_260_000,
      },
      {
        userId: "demo-user-2",
        income: 7_200_000,
        expense: 2_780_000,
        net: 4_420_000,
      },
    ],
    combined: {
      income: 15_700_000,
      expense: 6_020_000,
      net: 9_680_000,
      categories: [],
    },
  },
  savings: {
    cashBalances: [
      { userId: "demo-user-1", balance: 5_260_000 },
      { userId: "demo-user-2", balance: 4_420_000 },
    ],
    goals: [
      {
        id: "goal-1",
        createdByUserId: "demo-user-1",
        name: "Rumah pertama",
        ownershipScope: "shared",
        ownerUserId: null,
        balance: 38_500_000,
        targetAmount: 150_000_000,
        progressPercentage: 25.67,
        archivedAt: null,
      },
      {
        id: "goal-2",
        createdByUserId: "demo-user-2",
        name: "Liburan akhir tahun",
        ownershipScope: "shared",
        ownerUserId: null,
        balance: 8_750_000,
        targetAmount: 15_000_000,
        progressPercentage: 58.33,
        archivedAt: null,
      },
      {
        id: "goal-3",
        createdByUserId: "demo-user-1",
        name: "Dana tenang",
        ownershipScope: "personal",
        ownerUserId: "demo-user-1",
        balance: 12_000_000,
        targetAmount: null,
        progressPercentage: null,
        archivedAt: null,
      },
    ],
  },
  transactions: [
    {
      id: "transaction-1",
      ownerUserId: "demo-user-1",
      type: "expense",
      amount: 185_000,
      description: "Belanja mingguan",
      transactionDate: "2026-09-05",
      category: { name: "Belanja" },
    },
    {
      id: "transaction-2",
      ownerUserId: "demo-user-2",
      type: "income",
      amount: 7_200_000,
      description: "Gaji bulanan",
      transactionDate: "2026-09-03",
      category: { name: "Gaji" },
    },
    {
      id: "transaction-3",
      ownerUserId: "demo-user-1",
      type: "expense",
      amount: 420_000,
      description: "Makan malam",
      transactionDate: "2026-09-02",
      category: { name: "Makanan & Minuman" },
    },
  ],
  unread: 2,
};
