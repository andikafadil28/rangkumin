import { describe, expect, it } from "vitest";
import {
  createReminderSchema,
  updateReminderSchema,
} from "../src/schemas/reminder";
import {
  nextReminderRun,
  processDueReminders,
} from "../src/services/reminders";

describe("reminder recurrence", () => {
  it("menjaga jam Jakarta dan memakai hari terakhir bulan pendek", () => {
    expect(nextReminderRun("2026-01-31T03:00:00.000Z", "monthly", 31)).toBe(
      "2026-02-28T03:00:00.000Z",
    );
  });

  it("menghitung interval hari dan recurrence mingguan", () => {
    expect(
      nextReminderRun("2026-09-05T17:00:00.000Z", "interval_days", 3),
    ).toBe("2026-09-08T17:00:00.000Z");
    expect(nextReminderRun("2026-09-05T17:00:00.000Z", "weekly", 0)).toBe(
      "2026-09-12T17:00:00.000Z",
    );
    expect(nextReminderRun("2026-09-05T17:00:00.000Z", "weekly", 1)).toBe(
      "2026-09-06T17:00:00.000Z",
    );
  });
});

describe("reminder schemas", () => {
  const base = {
    title: "Bayar listrik",
    recurrence_type: "monthly",
    interval_value: 31,
    next_run_at: "2026-09-30T17:00:00.000Z",
    recipient_user_ids: ["user-1"],
  };

  it("menolak reminder tanpa notification channel", () => {
    expect(
      createReminderSchema.safeParse({
        ...base,
        notify_web: false,
        notify_telegram: false,
      }).success,
    ).toBe(false);
  });

  it("menerima partial update dan menolak body kosong", () => {
    expect(updateReminderSchema.safeParse({ title: "Bayar PLN" }).success).toBe(
      true,
    );
    expect(updateReminderSchema.safeParse({}).success).toBe(false);
  });

  it("menormalisasi timestamp offset ke UTC canonical", () => {
    const parsed = createReminderSchema.parse({
      ...base,
      next_run_at: "2026-10-01T00:00:00+07:00",
    });
    expect(parsed.next_run_at).toBe("2026-09-30T17:00:00.000Z");
    expect(
      updateReminderSchema.parse({
        next_run_at: "2026-10-01T00:00:00+07:00",
      }).next_run_at,
    ).toBe("2026-09-30T17:00:00.000Z");
  });
});

describe("reminder delivery", () => {
  it("tidak membuat notification duplikat untuk occurrence yang sama", async () => {
    let occurrenceExists = false;
    let notifications = 0;
    const notificationKeys = new Set<string>();
    const reminder = {
      id: "reminder-1",
      creator_user_id: "user-1",
      title: "Bayar listrik",
      description: null,
      amount: 100000,
      category_id: "expense-1",
      recurrence_type: "once",
      interval_value: null,
      next_run_at: "2026-09-05T00:00:00.000Z",
      timezone: "Asia/Jakarta",
      is_active: 1,
      notify_web: 1,
      notify_telegram: 1,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    };
    const database = {
      prepare(sql: string) {
        return {
          bind: (...values: unknown[]) => ({
            all: async () =>
              sql.includes("FROM reminders WHERE")
                ? { results: [reminder] }
                : { results: [{ user_id: "user-1" }] },
            run: async () => {
              if (sql.includes("INSERT INTO reminder_occurrences")) {
                const changes = occurrenceExists ? 0 : 1;
                occurrenceExists = true;
                return { meta: { changes } };
              }
              if (sql.includes("INSERT INTO notifications")) {
                const key = String(values[5]);
                if (notificationKeys.has(key)) return { meta: { changes: 0 } };
                notificationKeys.add(key);
                notifications += 1;
              }
              return { meta: { changes: 1 } };
            },
          }),
        };
      },
      batch(statements: D1PreparedStatement[]) {
        return Promise.all(statements.map((statement) => statement.run()));
      },
    } as unknown as D1Database;

    await processDueReminders(database, new Date("2026-09-06T00:00:00.000Z"));
    await processDueReminders(database, new Date("2026-09-06T00:00:00.000Z"));
    expect(notifications).toBe(2);
  });
});
