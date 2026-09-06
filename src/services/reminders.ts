import { ConflictError, NotFoundError } from "./errors";

export type RecurrenceType = "once" | "interval_days" | "weekly" | "monthly";

type ReminderRow = {
  id: string;
  creator_user_id: string;
  title: string;
  description: string | null;
  amount: number | null;
  category_id: string | null;
  recurrence_type: RecurrenceType;
  interval_value: number | null;
  next_run_at: string;
  timezone: string;
  is_active: number;
  notify_web: number;
  notify_telegram: number;
  created_at: string;
  updated_at: string;
};

export function nextReminderRun(
  current: string,
  type: RecurrenceType,
  interval: number | null,
): string | null {
  if (type === "once") return null;
  const date = new Date(current);
  if (type === "interval_days") {
    date.setUTCDate(date.getUTCDate() + interval!);
    return date.toISOString();
  }
  if (type === "weekly") {
    const jakartaWeekday = new Date(
      date.getTime() + 7 * 60 * 60 * 1000,
    ).getUTCDay();
    const days = (interval! - jakartaWeekday + 7) % 7 || 7;
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  }

  const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth() + 1;
  const targetMonth = month === 12 ? 1 : month + 1;
  const targetYear = month === 12 ? year + 1 : year;
  const day = Math.min(
    interval!,
    new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate(),
  );
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth - 1,
      day,
      local.getUTCHours() - 7,
      local.getUTCMinutes(),
      local.getUTCSeconds(),
      local.getUTCMilliseconds(),
    ),
  ).toISOString();
}

async function serializeReminder(database: D1Database, row: ReminderRow) {
  const recipients = (
    await database
      .prepare(
        `SELECT user_id FROM reminder_recipients WHERE reminder_id = ?1 ORDER BY user_id`,
      )
      .bind(row.id)
      .all<{ user_id: string }>()
  ).results.map((item) => item.user_id);
  return {
    id: row.id,
    creatorUserId: row.creator_user_id,
    title: row.title,
    description: row.description,
    amount: row.amount,
    categoryId: row.category_id,
    recurrenceType: row.recurrence_type,
    intervalValue: row.interval_value,
    nextRunAt: row.next_run_at,
    timezone: row.timezone,
    isActive: row.is_active === 1,
    notifyWeb: row.notify_web === 1,
    notifyTelegram: row.notify_telegram === 1,
    recipientUserIds: recipients,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertReminderCategory(
  database: D1Database,
  categoryId: string | null,
  userId: string,
  recipientUserIds?: string[],
) {
  if (!categoryId) return;
  const category = await database
    .prepare(
      `SELECT id, owner_user_id FROM categories WHERE id = ?1 AND type = 'expense'
     AND is_active = 1 AND (is_default = 1 OR owner_user_id = ?2) LIMIT 1`,
    )
    .bind(categoryId, userId)
    .first<{ id: string; owner_user_id: string | null }>();
  if (!category) throw new NotFoundError("Kategori expense tidak valid.");
  if (
    category.owner_user_id &&
    recipientUserIds?.some(
      (recipientId) => recipientId !== category.owner_user_id,
    )
  ) {
    throw new ConflictError(
      "Kategori custom tidak dapat digunakan untuk reminder pasangan.",
    );
  }
}

export async function createReminder(
  database: D1Database,
  input: {
    creatorUserId: string;
    title: string;
    description: string | null;
    amount: number | null;
    categoryId: string | null;
    recurrenceType: RecurrenceType;
    intervalValue: number | null;
    nextRunAt: string;
    recipientUserIds: string[];
    notifyWeb: boolean;
    notifyTelegram: boolean;
  },
) {
  await assertReminderCategory(
    database,
    input.categoryId,
    input.creatorUserId,
    input.recipientUserIds,
  );
  const users = await database
    .prepare(
      `SELECT COUNT(*) AS total FROM users WHERE is_active = 1 AND id IN (${input.recipientUserIds.map((_, i) => `?${i + 1}`).join(", ")})`,
    )
    .bind(...input.recipientUserIds)
    .first<{ total: number }>();
  if (users?.total !== input.recipientUserIds.length)
    throw new NotFoundError("Penerima reminder tidak valid.");

  const id = crypto.randomUUID();
  const statements = [
    database
      .prepare(
        `INSERT INTO reminders (
         id, creator_user_id, title, description, amount, category_id,
         recurrence_type, interval_value, next_run_at, notify_web, notify_telegram
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.creatorUserId,
        input.title,
        input.description,
        input.amount,
        input.categoryId,
        input.recurrenceType,
        input.intervalValue,
        input.nextRunAt,
        input.notifyWeb ? 1 : 0,
        input.notifyTelegram ? 1 : 0,
      ),
    ...input.recipientUserIds.map((userId) =>
      database
        .prepare(
          `INSERT INTO reminder_recipients (reminder_id, user_id) VALUES (?, ?)`,
        )
        .bind(id, userId),
    ),
  ];
  await database.batch(statements);
  return { id };
}

export async function updateReminder(
  database: D1Database,
  reminderId: string,
  creatorUserId: string,
  patch: {
    title?: string;
    description?: string | null;
    amount?: number | null;
    categoryId?: string | null;
    recurrenceType?: RecurrenceType;
    intervalValue?: number | null;
    nextRunAt?: string;
    recipientUserIds?: string[];
    notifyWeb?: boolean;
    notifyTelegram?: boolean;
    isActive?: boolean;
  },
) {
  const current = await database
    .prepare(
      `SELECT * FROM reminders WHERE id = ?1 AND creator_user_id = ?2 LIMIT 1`,
    )
    .bind(reminderId, creatorUserId)
    .first<ReminderRow>();
  if (!current) throw new NotFoundError("Reminder tidak ditemukan.");
  await assertReminderCategory(
    database,
    patch.categoryId === undefined ? current.category_id : patch.categoryId,
    creatorUserId,
    patch.recipientUserIds ??
      (
        await database
          .prepare(
            `SELECT user_id FROM reminder_recipients WHERE reminder_id = ?1`,
          )
          .bind(reminderId)
          .all<{ user_id: string }>()
      ).results.map((recipient) => recipient.user_id),
  );

  const recurrenceType = patch.recurrenceType ?? current.recurrence_type;
  const intervalValue =
    patch.intervalValue === undefined
      ? current.interval_value
      : patch.intervalValue;
  const validRecurrence =
    recurrenceType === "once"
      ? intervalValue == null
      : recurrenceType === "interval_days"
        ? Boolean(intervalValue && intervalValue > 0)
        : recurrenceType === "weekly"
          ? intervalValue != null && intervalValue >= 0 && intervalValue <= 6
          : intervalValue != null && intervalValue >= 1 && intervalValue <= 31;
  if (!validRecurrence)
    throw new ConflictError("Konfigurasi recurrence tidak valid.");

  const notifyWeb = patch.notifyWeb ?? current.notify_web === 1;
  const notifyTelegram = patch.notifyTelegram ?? current.notify_telegram === 1;
  if (!notifyWeb && !notifyTelegram) {
    throw new ConflictError("Minimal satu notification channel wajib aktif.");
  }
  if (patch.recipientUserIds) {
    const placeholders = patch.recipientUserIds
      .map((_, index) => `?${index + 1}`)
      .join(", ");
    const users = await database
      .prepare(
        `SELECT COUNT(*) AS total FROM users WHERE is_active = 1 AND id IN (${placeholders})`,
      )
      .bind(...patch.recipientUserIds)
      .first<{ total: number }>();
    if (users?.total !== patch.recipientUserIds.length) {
      throw new NotFoundError("Penerima reminder tidak valid.");
    }
  }

  const now = new Date().toISOString();
  const statements = [
    database
      .prepare(
        `UPDATE reminders SET title = ?1, description = ?2, amount = ?3,
       category_id = ?4, recurrence_type = ?5, interval_value = ?6,
       next_run_at = ?7, notify_web = ?8, notify_telegram = ?9,
       is_active = ?10, updated_at = ?11
     WHERE id = ?12 AND creator_user_id = ?13`,
      )
      .bind(
        patch.title ?? current.title,
        patch.description === undefined
          ? current.description
          : patch.description,
        patch.amount === undefined ? current.amount : patch.amount,
        patch.categoryId === undefined ? current.category_id : patch.categoryId,
        recurrenceType,
        intervalValue,
        patch.nextRunAt ?? current.next_run_at,
        notifyWeb ? 1 : 0,
        notifyTelegram ? 1 : 0,
        patch.isActive === undefined
          ? current.is_active
          : patch.isActive
            ? 1
            : 0,
        now,
        reminderId,
        creatorUserId,
      ),
  ];
  if (patch.recipientUserIds) {
    statements.push(
      database
        .prepare(`DELETE FROM reminder_recipients WHERE reminder_id = ?1`)
        .bind(reminderId),
      ...patch.recipientUserIds.map((userId) =>
        database
          .prepare(
            `INSERT INTO reminder_recipients (reminder_id, user_id) VALUES (?, ?)`,
          )
          .bind(reminderId, userId),
      ),
    );
  }
  await database.batch(statements);
  const updated = await database
    .prepare(`SELECT * FROM reminders WHERE id = ?1`)
    .bind(reminderId)
    .first<ReminderRow>();
  return serializeReminder(database, updated!);
}

export async function listReminders(
  database: D1Database,
  userId: string,
  includeInactive = false,
) {
  const { results } = await database
    .prepare(
      `SELECT DISTINCT r.* FROM reminders r
     LEFT JOIN reminder_recipients rr ON rr.reminder_id = r.id
     WHERE (r.creator_user_id = ?1 OR rr.user_id = ?1)
       ${includeInactive ? "" : "AND r.is_active = 1"}
     ORDER BY r.next_run_at`,
    )
    .bind(userId)
    .all<ReminderRow>();
  return Promise.all(results.map((row) => serializeReminder(database, row)));
}

export async function processDueReminders(
  database: D1Database,
  now = new Date(),
) {
  const due = (
    await database
      .prepare(
        `SELECT * FROM reminders WHERE is_active = 1 AND next_run_at <= ?1 ORDER BY next_run_at LIMIT 100`,
      )
      .bind(now.toISOString())
      .all<ReminderRow>()
  ).results;
  let occurrences = 0;
  for (const reminder of due) {
    const occurrenceId = crypto.randomUUID();
    const recipients = (
      await database
        .prepare(
          `SELECT user_id FROM reminder_recipients WHERE reminder_id = ?1`,
        )
        .bind(reminder.id)
        .all<{ user_id: string }>()
    ).results;
    const next = nextReminderRun(
      reminder.next_run_at,
      reminder.recurrence_type,
      reminder.interval_value,
    );
    const statements = [
      database
        .prepare(
          `INSERT INTO reminder_occurrences (id, reminder_id, scheduled_for)
         SELECT ?1, ?2, ?3 WHERE EXISTS (
           SELECT 1 FROM reminders WHERE id = ?2 AND is_active = 1
             AND next_run_at = ?3 AND updated_at = ?4
         ) ON CONFLICT(reminder_id, scheduled_for) DO NOTHING`,
        )
        .bind(
          occurrenceId,
          reminder.id,
          reminder.next_run_at,
          reminder.updated_at,
        ),
      ...recipients.flatMap((recipient) =>
        [
          ...(reminder.notify_web ? ["dashboard"] : []),
          ...(reminder.notify_telegram ? ["telegram"] : []),
        ].map((channel) =>
          database
            .prepare(
              `INSERT INTO notifications (
               id, recipient_user_id, kind, channel, reminder_occurrence_id,
               title, body, dedupe_key, scheduled_for
             ) SELECT ?1, ?2, 'reminder', ?3, ro.id, ?4, ?5, ?6, ?7
               FROM reminder_occurrences ro JOIN reminders r ON r.id = ro.reminder_id
              WHERE ro.reminder_id = ?8 AND ro.scheduled_for = ?7
                AND r.is_active = 1 AND r.next_run_at = ?7 AND r.updated_at = ?9
             ON CONFLICT(dedupe_key) DO NOTHING`,
            )
            .bind(
              crypto.randomUUID(),
              recipient.user_id,
              channel,
              reminder.title,
              reminder.description ?? reminder.title,
              `reminder:${reminder.id}:${reminder.next_run_at}:${recipient.user_id}:${channel}`,
              reminder.next_run_at,
              reminder.id,
              reminder.updated_at,
            ),
        ),
      ),
      database
        .prepare(
          `UPDATE reminders SET next_run_at = COALESCE(?1, next_run_at),
           is_active = ?2, updated_at = ?3
         WHERE id = ?4 AND is_active = 1 AND next_run_at = ?5 AND updated_at = ?6`,
        )
        .bind(
          next,
          next ? 1 : 0,
          now.toISOString(),
          reminder.id,
          reminder.next_run_at,
          reminder.updated_at,
        ),
    ];
    const results = await database.batch(statements);
    occurrences += results[0]?.meta.changes ?? 0;
  }
  return occurrences;
}

async function assertRecipient(
  database: D1Database,
  occurrenceId: string,
  userId: string,
) {
  const row = await database
    .prepare(
      `SELECT ro.id FROM reminder_occurrences ro
     JOIN reminder_recipients rr ON rr.reminder_id = ro.reminder_id
     WHERE ro.id = ?1 AND rr.user_id = ?2 LIMIT 1`,
    )
    .bind(occurrenceId, userId)
    .first<{ id: string }>();
  if (!row) throw new NotFoundError("Occurrence reminder tidak ditemukan.");
}

export async function completeOccurrence(
  database: D1Database,
  occurrenceId: string,
  userId: string,
) {
  await assertRecipient(database, occurrenceId, userId);
  const result = await database
    .prepare(
      `UPDATE reminder_occurrences SET status = 'completed', snoozed_until = NULL,
       completed_by_user_id = ?1, completed_at = ?2, updated_at = ?2
     WHERE id = ?3 AND status <> 'completed'`,
    )
    .bind(userId, new Date().toISOString(), occurrenceId)
    .run();
  if (result.meta.changes !== 1)
    throw new ConflictError("Reminder sudah diselesaikan.");
}

export async function snoozeOccurrence(
  database: D1Database,
  occurrenceId: string,
  userId: string,
  until: string,
) {
  await assertRecipient(database, occurrenceId, userId);
  if (new Date(until) <= new Date())
    throw new ConflictError("Waktu snooze harus di masa depan.");
  const result = await database
    .prepare(
      `UPDATE reminder_occurrences SET status = 'snoozed', snoozed_until = ?1,
       completed_at = NULL, completed_by_user_id = NULL, updated_at = ?2
     WHERE id = ?3 AND status <> 'completed'`,
    )
    .bind(until, new Date().toISOString(), occurrenceId)
    .run();
  if (result.meta.changes !== 1)
    throw new ConflictError("Reminder sudah diselesaikan.");
}

export async function processSnoozedOccurrences(
  database: D1Database,
  now = new Date(),
) {
  const { results } = await database
    .prepare(
      `SELECT ro.id, ro.snoozed_until, r.id AS reminder_id, r.title,
         r.description, r.notify_web, r.notify_telegram, r.updated_at
       FROM reminder_occurrences ro
       JOIN reminders r ON r.id = ro.reminder_id
       WHERE ro.status = 'snoozed' AND ro.snoozed_until <= ?1 AND r.is_active = 1
       ORDER BY ro.snoozed_until, ro.id LIMIT 100`,
    )
    .bind(now.toISOString())
    .all<{
      id: string;
      snoozed_until: string;
      reminder_id: string;
      title: string;
      description: string | null;
      notify_web: number;
      notify_telegram: number;
      updated_at: string;
    }>();

  for (const occurrence of results) {
    const recipients = (
      await database
        .prepare(
          `SELECT user_id FROM reminder_recipients WHERE reminder_id = ?1`,
        )
        .bind(occurrence.reminder_id)
        .all<{ user_id: string }>()
    ).results;
    const statements = [];
    for (const recipient of recipients) {
      for (const channel of [
        ...(occurrence.notify_web ? ["dashboard"] : []),
        ...(occurrence.notify_telegram ? ["telegram"] : []),
      ]) {
        statements.push(
          database
            .prepare(
              `INSERT INTO notifications (id, recipient_user_id, kind, channel,
               reminder_occurrence_id, title, body, dedupe_key, scheduled_for)
             SELECT ?1, ?2, 'reminder', ?3, ro.id, ?4, ?5, ?6, ?7
              FROM reminder_occurrences ro JOIN reminders r ON r.id = ro.reminder_id
              WHERE ro.id = ?8 AND ro.status = 'snoozed' AND ro.snoozed_until = ?7
                AND r.is_active = 1 AND r.updated_at = ?9
                AND EXISTS (SELECT 1 FROM reminder_recipients rr
                  WHERE rr.reminder_id = r.id AND rr.user_id = ?2)
             ON CONFLICT(dedupe_key) DO NOTHING`,
            )
            .bind(
              crypto.randomUUID(),
              recipient.user_id,
              channel,
              occurrence.title,
              occurrence.description ?? occurrence.title,
              `reminder-snooze:${occurrence.id}:${occurrence.snoozed_until}:${recipient.user_id}:${channel}`,
              occurrence.snoozed_until,
              occurrence.id,
              occurrence.updated_at,
            ),
        );
      }
    }
    statements.push(
      database
        .prepare(
          `UPDATE reminder_occurrences SET status = 'pending', snoozed_until = NULL,
          updated_at = ?1 WHERE id = ?2 AND status = 'snoozed' AND snoozed_until = ?3
            AND EXISTS (SELECT 1 FROM reminders r WHERE r.id = reminder_id
              AND r.is_active = 1 AND r.updated_at = ?4)`,
        )
        .bind(
          now.toISOString(),
          occurrence.id,
          occurrence.snoozed_until,
          occurrence.updated_at,
        ),
    );
    await database.batch(statements);
  }
  return results.length;
}

export async function recordOccurrenceExpense(
  database: D1Database,
  occurrenceId: string,
  userId: string,
  idempotencyKey: string,
  source: "web" | "telegram" = "web",
) {
  const findReplay = () =>
    database
      .prepare(
        `SELECT t.id, t.owner_user_id, ro.id AS occurrence_id
       FROM transactions t
       LEFT JOIN reminder_occurrences ro ON ro.expense_transaction_id = t.id
       WHERE t.idempotency_key = ?1 LIMIT 1`,
      )
      .bind(idempotencyKey)
      .first<{
        id: string;
        owner_user_id: string;
        occurrence_id: string | null;
      }>();
  const existing = await findReplay();
  if (existing) {
    if (
      existing.owner_user_id !== userId ||
      existing.occurrence_id !== occurrenceId
    ) {
      throw new ConflictError("Idempotency key sudah digunakan.");
    }
    return { transactionId: existing.id, replayed: true };
  }

  const occurrence = await database
    .prepare(
      `SELECT ro.status, ro.scheduled_for, r.title, r.amount, r.category_id
       FROM reminder_occurrences ro JOIN reminders r ON r.id = ro.reminder_id
       JOIN reminder_recipients rr ON rr.reminder_id = r.id
       WHERE ro.id = ?1 AND rr.user_id = ?2 LIMIT 1`,
    )
    .bind(occurrenceId, userId)
    .first<{
      status: string;
      scheduled_for: string;
      title: string;
      amount: number | null;
      category_id: string | null;
    }>();
  if (!occurrence)
    throw new NotFoundError("Occurrence reminder tidak ditemukan.");
  if (occurrence.status === "completed")
    throw new ConflictError("Reminder sudah diselesaikan.");
  if (!occurrence.amount || !occurrence.category_id) {
    throw new ConflictError(
      "Reminder tidak memiliki amount dan kategori expense.",
    );
  }
  await assertReminderCategory(database, occurrence.category_id, userId);

  const transactionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const transactionDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(occurrence.scheduled_for));
  let results: D1Result[];
  try {
    results = await database.batch([
      database
        .prepare(
          `INSERT INTO transactions (id, owner_user_id, type, category_id, amount,
           description, transaction_date, source, idempotency_key, created_at, updated_at)
         SELECT ?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM reminder_occurrences WHERE id = ? AND status <> 'completed')`,
        )
        .bind(
          transactionId,
          userId,
          occurrence.category_id,
          occurrence.amount,
          occurrence.title,
          transactionDate,
          source,
          idempotencyKey,
          now,
          now,
          occurrenceId,
        ),
      database
        .prepare(
          `UPDATE reminder_occurrences SET status = 'completed', snoozed_until = NULL,
         completed_by_user_id = ?1, completed_at = ?2,
         expense_transaction_id = ?3, updated_at = ?2
         WHERE id = ?4 AND status <> 'completed'`,
        )
        .bind(userId, now, transactionId, occurrenceId),
    ]);
  } catch (error) {
    const replay = await findReplay();
    if (replay) {
      if (
        replay.owner_user_id !== userId ||
        replay.occurrence_id !== occurrenceId
      ) {
        throw new ConflictError("Idempotency key sudah digunakan.");
      }
      return { transactionId: replay.id, replayed: true };
    }
    const completed = await database
      .prepare(`SELECT status FROM reminder_occurrences WHERE id = ?1 LIMIT 1`)
      .bind(occurrenceId)
      .first<{ status: string }>();
    if (completed?.status === "completed") {
      throw new ConflictError("Reminder sudah diselesaikan.");
    }
    throw error;
  }
  if (results.some((result) => result.meta.changes !== 1)) {
    const replay = await findReplay();
    if (replay) {
      if (
        replay.owner_user_id !== userId ||
        replay.occurrence_id !== occurrenceId
      ) {
        throw new ConflictError("Idempotency key sudah digunakan.");
      }
      return { transactionId: replay.id, replayed: true };
    }
    throw new ConflictError(
      "Reminder sudah diproses atau kategori tidak valid.",
    );
  }
  return { transactionId, replayed: false };
}
