import { afterEach, describe, expect, it, vi } from "vitest";
import type * as ApiModule from "../frontend/src/api";
import {
  AuthRequiredError,
  ApiError,
  NetworkError,
  createTransaction,
  getIdentity,
} from "../frontend/src/api";
import {
  getOutboxItem,
  putOutboxItem,
  resetOfflineDatabaseForTests,
} from "../frontend/src/offline/db";
import {
  createOrQueueTransaction,
  syncTransactionOutbox,
} from "../frontend/src/offline/sync";

vi.mock("../frontend/src/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    createTransaction: vi.fn(),
    getIdentity: vi.fn(),
  };
});

const input = {
  type: "expense" as const,
  amount: 15_000,
  category_id: "category-expense-belanja",
  transaction_date: "2026-09-06",
};

afterEach(async () => {
  vi.mocked(createTransaction).mockReset();
  vi.mocked(getIdentity).mockReset();
  await resetOfflineDatabaseForTests();
});

describe("transaction outbox", () => {
  it("menghapus item setelah server menerima key yang sama", async () => {
    vi.mocked(getIdentity).mockResolvedValue({
      user: { id: "user-1", displayName: "User 1" },
    });
    vi.mocked(createTransaction).mockResolvedValue({
      transaction: {} as never,
    });

    const result = await createOrQueueTransaction("user-1", input);

    expect(result.status).toBe("synced");
    expect(createTransaction).toHaveBeenCalledWith(
      input,
      result.idempotencyKey,
      "user-1",
    );
    expect(await getOutboxItem(result.idempotencyKey)).toBeUndefined();
  });

  it("mempertahankan key setelah network failure", async () => {
    vi.mocked(getIdentity).mockResolvedValue({
      user: { id: "user-1", displayName: "User 1" },
    });
    vi.mocked(createTransaction).mockRejectedValue(new NetworkError());

    const result = await createOrQueueTransaction("user-1", input);
    const item = await getOutboxItem(result.idempotencyKey);

    expect(result.status).toBe("queued");
    expect(item?.idempotencyKey).toBe(result.idempotencyKey);
    expect(item?.attempts).toBe(1);
  });

  it("tidak mengirim outbox milik akun lain", async () => {
    await putOutboxItem({
      idempotencyKey: "offline-request-0002",
      actorUserId: "user-1",
      input,
      createdAt: "2026-09-06T00:00:00.000Z",
      attempts: 0,
      nextAttemptAt: null,
      status: "pending",
      lastError: null,
    });
    vi.mocked(getIdentity).mockResolvedValue({
      user: { id: "user-2", displayName: "User 2" },
    });

    const report = await syncTransactionOutbox();

    expect(report.waitingForAccount).toBe(1);
    expect(createTransaction).not.toHaveBeenCalled();
    expect(await getOutboxItem("offline-request-0002")).toBeDefined();
  });

  it("mempertahankan outbox jika sesi berubah setelah identity check", async () => {
    await putOutboxItem({
      idempotencyKey: "offline-request-0003",
      actorUserId: "user-1",
      input,
      createdAt: "2026-09-06T00:00:00.000Z",
      attempts: 0,
      nextAttemptAt: null,
      status: "pending",
      lastError: null,
    });
    vi.mocked(getIdentity).mockResolvedValue({
      user: { id: "user-1", displayName: "User 1" },
    });
    vi.mocked(createTransaction).mockRejectedValue(
      new ApiError(
        "Akun aktif tidak sesuai dengan pemilik transaksi offline.",
        409,
        "Actor Mismatch",
      ),
    );

    const report = await syncTransactionOutbox();

    expect(report.waitingForAccount).toBe(1);
    expect((await getOutboxItem("offline-request-0003"))?.status).toBe(
      "pending",
    );
  });

  it("tidak mengantre request baru saat sesi Access berakhir", async () => {
    vi.mocked(getIdentity).mockRejectedValue(new AuthRequiredError());

    await expect(
      createOrQueueTransaction("user-1", input),
    ).rejects.toBeInstanceOf(AuthRequiredError);
    expect(createTransaction).not.toHaveBeenCalled();
  });
});
