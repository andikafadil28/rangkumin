import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Wallet } from "../frontend/src/api";
import {
  WalletsPage,
  filterWallets,
  getAllocationMaximum,
  groupWallets,
} from "../frontend/src/WalletsPage";

function wallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: "wallet-1",
    ownerUserId: "user-1",
    type: "bank",
    name: "Rekening Harian",
    description: null,
    icon: null,
    color: "#597367",
    groupName: "bank",
    initialBalance: 100_000,
    defaultWallet: true,
    sortOrder: 0,
    isArchived: false,
    archivedAt: null,
    balance: 100_000,
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("wallet page helpers", () => {
  const wallets = [
    wallet(),
    wallet({
      id: "wallet-2",
      ownerUserId: "user-2",
      name: "Bank Pasangan",
    }),
    wallet({
      id: "wallet-3",
      name: "Cash Arsip",
      type: "cash",
      groupName: "cash",
      defaultWallet: false,
      isArchived: true,
      archivedAt: "2026-09-17T01:00:00.000Z",
    }),
  ];

  it("memisahkan dompet aktif dan arsip sesuai mode tampilan", () => {
    expect(filterWallets(wallets, "user-1", "solo", false)).toHaveLength(1);
    expect(filterWallets(wallets, "user-1", "couple", false)).toHaveLength(2);
    expect(filterWallets(wallets, "user-1", "solo", true)).toEqual([
      wallets[2],
    ]);
  });

  it("tidak menggabungkan grup bernama sama milik dua pengguna", () => {
    const groups = groupWallets(wallets.slice(0, 2));

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.ownerUserId)).toEqual([
      "user-1",
      "user-2",
    ]);
    expect(groups.every((group) => group.label === "Bank")).toBe(true);
  });

  it("membatasi alokasi berdasarkan arah tanpa menambah total saldo", () => {
    const overview = {
      ownerUserId: "user-1",
      cashBalance: 500_000,
      walletBalance: 300_000,
      unallocatedBalance: 200_000,
    };

    expect(getAllocationMaximum("to_wallet", overview, wallet())).toBe(200_000);
    expect(
      getAllocationMaximum(
        "to_unallocated",
        overview,
        wallet({ balance: 125_000 }),
      ),
    ).toBe(125_000);
  });
});

describe("WalletsPage", () => {
  it("merender heading, ringkasan, dan loading state yang dapat diakses", () => {
    const html = renderToStaticMarkup(
      <WalletsPage
        userId="user-1"
        viewMode="couple"
        hidden={false}
        online
        onQuickAdd={() => undefined}
      />,
    );

    expect(html).toContain('aria-labelledby="wallets-page-title"');
    expect(html).toContain("Di mana uangmu berada");
    expect(html).toContain("Saldo tersedia");
    expect(html).toContain('class="wallets-loading"');
  });
});
