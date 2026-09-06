import { afterEach, describe, expect, it, vi } from "vitest";
import type * as ApiModule from "../frontend/src/api";
import {
  AuthRequiredError,
  NetworkError,
  getDashboard,
} from "../frontend/src/api";
import {
  rememberActiveUser,
  resetOfflineDatabaseForTests,
  saveSnapshot,
} from "../frontend/src/offline/db";
import { loadDashboardSnapshot } from "../frontend/src/offline/snapshots";

vi.mock("../frontend/src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, getDashboard: vi.fn() };
});

const dashboard = {
  user: { id: "user-1", displayName: "User 1" },
  summary: {
    period: { from: "2026-09-01", to: "2026-09-30" },
    byUser: [],
    combined: { income: 0, expense: 0, net: 0, categories: [] },
  },
  savings: { cashBalances: [], goals: [] },
  transactions: [],
  unread: 0,
  categories: [],
};

afterEach(async () => {
  vi.mocked(getDashboard).mockReset();
  await resetOfflineDatabaseForTests();
});

describe("dashboard snapshot", () => {
  it("memakai snapshot hanya ketika network gagal", async () => {
    await rememberActiveUser("user-1");
    await saveSnapshot("user-1", "dashboard", dashboard);
    vi.mocked(getDashboard).mockRejectedValue(new NetworkError());

    const result = await loadDashboardSnapshot();

    expect(result.stale).toBe(true);
    expect(result.data.user.id).toBe("user-1");
  });

  it("tidak membuka snapshot ketika sesi Access berakhir", async () => {
    await rememberActiveUser("user-1");
    await saveSnapshot("user-1", "dashboard", dashboard);
    vi.mocked(getDashboard).mockRejectedValue(new AuthRequiredError());

    await expect(loadDashboardSnapshot()).rejects.toBeInstanceOf(
      AuthRequiredError,
    );
  });
});
