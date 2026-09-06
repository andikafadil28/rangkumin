import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getViewMode,
  partitionBudgets,
  partitionGoals,
  partitionReminders,
  setViewMode,
} from "../frontend/src/viewMode";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getViewMode / setViewMode", () => {
  it("default ke couple saat key kosong", () => {
    vi.stubGlobal(
      "localStorage",
      createLocalStorage({ "rangkumin-view": null }),
    );
    expect(getViewMode()).toBe("couple");
  });

  it("menyimpan dan membaca solo", () => {
    const storage = createLocalStorage({ "rangkumin-view": null });
    vi.stubGlobal("localStorage", storage);
    setViewMode("solo");
    expect(getViewMode()).toBe("solo");
  });

  it("fallback ke couple untuk nilai tidak dikenal", () => {
    const storage = createLocalStorage({ "rangkumin-view": "solo" });
    vi.stubGlobal("localStorage", storage);
    storage.setItem("rangkumin-view", "aneh");
    expect(getViewMode()).toBe("couple");
  });
});

describe("partitionGoals", () => {
  const goals = [
    { id: "a", ownershipScope: "shared", ownerUserId: null },
    { id: "b", ownershipScope: "personal", ownerUserId: "u1" },
    { id: "c", ownershipScope: "personal", ownerUserId: "u2" },
  ] as const;

  it("couple mengembalikan semua", () => {
    expect(partitionGoals(goals, "u1", "couple")).toHaveLength(3);
  });

  it("solo menampilkan shared dan milik sendiri saja", () => {
    const result = partitionGoals(goals, "u1", "solo");
    expect(result.map((goal) => goal.id)).toEqual(["a", "b"]);
  });

  it("solo menampilkan shared dan milik pasangan", () => {
    const result = partitionGoals(goals, "u2", "solo");
    expect(result.map((goal) => goal.id)).toEqual(["a", "c"]);
  });
});

describe("partitionBudgets", () => {
  const budgets = [
    { id: "a", ownershipScope: "shared", createdByUserId: "u1" },
    { id: "b", ownershipScope: "personal", createdByUserId: "u1" },
    { id: "c", ownershipScope: "personal", createdByUserId: "u2" },
  ] as const;

  it("couple mengembalikan semua", () => {
    expect(partitionBudgets(budgets, "u1", "couple")).toHaveLength(3);
  });

  it("solo menampilkan shared dan anggaran milik sendiri", () => {
    const result = partitionBudgets(budgets, "u1", "solo");
    expect(result.map((budget) => budget.id)).toEqual(["a", "b"]);
  });
});

describe("partitionReminders", () => {
  const reminders = [
    { id: "a", creatorUserId: "u1", recipientUserIds: ["u1", "u2"] },
    { id: "b", creatorUserId: "u1", recipientUserIds: ["u1"] },
    { id: "c", creatorUserId: "u2", recipientUserIds: ["u2"] },
    { id: "d", creatorUserId: "u2", recipientUserIds: ["u1"] },
  ];

  it("couple mengembalikan semua", () => {
    expect(partitionReminders(reminders, "u1", "couple")).toHaveLength(4);
  });

  it("solo menampilkan reminder untuk atau dibuat sendiri", () => {
    const result = partitionReminders(reminders, "u1", "solo");
    expect(result.map((reminder) => reminder.id)).toEqual(["a", "b", "d"]);
  });
});

function createLocalStorage(initial: Record<string, string | null>) {
  const map = new Map<string, string | null>(Object.entries(initial));
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}
