ALTER TABLE reminders ADD COLUMN notify_web INTEGER NOT NULL DEFAULT 1
  CHECK (notify_web IN (0, 1));

ALTER TABLE reminders ADD COLUMN notify_telegram INTEGER NOT NULL DEFAULT 1
  CHECK (notify_telegram IN (0, 1));

CREATE TABLE reminder_occurrences (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL REFERENCES reminders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'snoozed')),
  snoozed_until TEXT,
  completed_by_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  completed_at TEXT,
  expense_transaction_id TEXT REFERENCES transactions(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (reminder_id, scheduled_for),
  CHECK (
    (status = 'pending' AND snoozed_until IS NULL AND completed_at IS NULL)
    OR (status = 'snoozed' AND snoozed_until IS NOT NULL AND completed_at IS NULL)
    OR (status = 'completed' AND snoozed_until IS NULL AND completed_at IS NOT NULL)
  )
) STRICT;

CREATE INDEX reminder_occurrences_due_index
  ON reminder_occurrences(snoozed_until)
  WHERE status = 'snoozed';

CREATE INDEX reminder_occurrences_reminder_index
  ON reminder_occurrences(reminder_id, scheduled_for DESC);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('budget_threshold', 'reminder')),
  channel TEXT NOT NULL CHECK (channel IN ('dashboard', 'telegram')),
  budget_threshold_id TEXT REFERENCES budget_thresholds(id) ON UPDATE CASCADE ON DELETE CASCADE,
  reminder_occurrence_id TEXT REFERENCES reminder_occurrences(id) ON UPDATE CASCADE ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 1000),
  dedupe_key TEXT NOT NULL UNIQUE CHECK (length(trim(dedupe_key)) BETWEEN 8 AND 500),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'read')),
  scheduled_for TEXT NOT NULL,
  delivered_at TEXT,
  read_at TEXT,
  error_message TEXT CHECK (error_message IS NULL OR length(error_message) <= 1000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (kind = 'budget_threshold' AND budget_threshold_id IS NOT NULL AND reminder_occurrence_id IS NULL)
    OR (kind = 'reminder' AND budget_threshold_id IS NULL AND reminder_occurrence_id IS NOT NULL)
  )
) STRICT;

CREATE INDEX notifications_recipient_status_index
  ON notifications(recipient_user_id, status, created_at DESC);

CREATE INDEX notifications_delivery_index
  ON notifications(channel, status, scheduled_for)
  WHERE status IN ('pending', 'failed');
