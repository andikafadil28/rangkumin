import { describe, expect, it, vi } from "vitest";
import { purgeExpiredTransactions } from "../src/services/trash";

describe("purgeExpiredTransactions", () => {
  it("menghapus transaksi Trash yang melewati purge_after", async () => {
    const run = vi.fn().mockResolvedValue({ meta: { changes: 3 } });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const database = { prepare } as unknown as D1Database;
    const now = new Date("2026-09-05T00:00:00.000Z");

    await expect(purgeExpiredTransactions(database, now)).resolves.toBe(3);
    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining("purge_after <= ?1"),
    );
    expect(bind).toHaveBeenCalledWith("2026-09-05T00:00:00.000Z");
    expect(run).toHaveBeenCalledOnce();
  });

  it("meneruskan kegagalan D1 agar cron tercatat gagal", async () => {
    const run = vi.fn().mockRejectedValue(new Error("D1 unavailable"));
    const bind = vi.fn().mockReturnValue({ run });
    const database = {
      prepare: vi.fn().mockReturnValue({ bind }),
    } as unknown as D1Database;

    await expect(purgeExpiredTransactions(database)).rejects.toThrow(
      "D1 unavailable",
    );
  });
});
