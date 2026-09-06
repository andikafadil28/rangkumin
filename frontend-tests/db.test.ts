import { afterEach, describe, expect, it } from "vitest";
import {
  clearOfflineData,
  getOutboxItems,
  getSnapshot,
  putOutboxItem,
  resetOfflineDatabaseForTests,
  saveSnapshot,
} from "../frontend/src/offline/db";

afterEach(async () => {
  await resetOfflineDatabaseForTests();
});

describe("offline database", () => {
  it("memisahkan snapshot berdasarkan user", async () => {
    await saveSnapshot("user-1", "dashboard", { balance: 10 });
    await saveSnapshot("user-2", "dashboard", { balance: 20 });

    expect(
      (await getSnapshot<{ balance: number }>("user-1", "dashboard"))?.data,
    ).toEqual({ balance: 10 });
    expect(
      (await getSnapshot<{ balance: number }>("user-2", "dashboard"))?.data,
    ).toEqual({ balance: 20 });
  });

  it("menyimpan outbox sampai data perangkat dihapus", async () => {
    await putOutboxItem({
      idempotencyKey: "offline-request-0001",
      actorUserId: "user-1",
      input: {
        type: "expense",
        amount: 10_000,
        category_id: "category-expense-belanja",
        transaction_date: "2026-09-06",
      },
      createdAt: "2026-09-06T00:00:00.000Z",
      attempts: 0,
      nextAttemptAt: null,
      status: "pending",
      lastError: null,
    });

    expect(await getOutboxItems()).toHaveLength(1);
    await clearOfflineData();
    expect(await getOutboxItems()).toHaveLength(0);
  });
});
