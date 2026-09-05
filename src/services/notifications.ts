import { NotFoundError } from "./errors";

export async function listNotifications(database: D1Database, userId: string) {
  const { results } = await database
    .prepare(
      `SELECT id, kind, channel, reminder_occurrence_id, title, body, status, scheduled_for,
       delivered_at, read_at, created_at
     FROM notifications WHERE recipient_user_id = ?1 AND channel = 'dashboard'
     ORDER BY created_at DESC LIMIT 100`,
    )
    .bind(userId)
    .all<{
      id: string;
      kind: string;
      channel: string;
      reminder_occurrence_id: string | null;
      title: string;
      body: string;
      status: string;
      scheduled_for: string;
      delivered_at: string | null;
      read_at: string | null;
      created_at: string;
    }>();
  return results.map((row) => ({
    id: row.id,
    kind: row.kind,
    channel: row.channel,
    reminderOccurrenceId: row.reminder_occurrence_id,
    title: row.title,
    body: row.body,
    status: row.status,
    scheduledFor: row.scheduled_for,
    deliveredAt: row.delivered_at,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

export async function markNotificationRead(
  database: D1Database,
  notificationId: string,
  userId: string,
) {
  const now = new Date().toISOString();
  const result = await database
    .prepare(
      `UPDATE notifications SET status = 'read', read_at = ?1, updated_at = ?1
     WHERE id = ?2 AND recipient_user_id = ?3 AND channel = 'dashboard'`,
    )
    .bind(now, notificationId, userId)
    .run();
  if (result.meta.changes !== 1)
    throw new NotFoundError("Notifikasi tidak ditemukan.");
}
