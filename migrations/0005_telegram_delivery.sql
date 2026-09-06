CREATE TABLE telegram_updates_new (
  update_id INTEGER PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  error_message TEXT CHECK (error_message IS NULL OR length(error_message) <= 1000),
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  processed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO telegram_updates_new (
  update_id, telegram_user_id, status, attempt_count, received_at, processed_at, updated_at
)
SELECT update_id, telegram_user_id, 'processed', 1, processed_at, processed_at, processed_at
FROM telegram_updates;

DROP TABLE telegram_updates;
ALTER TABLE telegram_updates_new RENAME TO telegram_updates;

CREATE INDEX telegram_updates_status_index
  ON telegram_updates(status, updated_at);

CREATE TABLE notifications_new (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('budget_threshold', 'reminder', 'transaction')),
  channel TEXT NOT NULL CHECK (channel IN ('dashboard', 'telegram')),
  budget_threshold_id TEXT REFERENCES budget_thresholds(id) ON UPDATE CASCADE ON DELETE SET NULL,
  reminder_occurrence_id TEXT REFERENCES reminder_occurrences(id) ON UPDATE CASCADE ON DELETE CASCADE,
  transaction_id TEXT REFERENCES transactions(id) ON UPDATE CASCADE ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 1000),
  dedupe_key TEXT NOT NULL UNIQUE CHECK (length(trim(dedupe_key)) BETWEEN 8 AND 500),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'read')),
  scheduled_for TEXT NOT NULL,
  delivered_at TEXT,
  read_at TEXT,
  error_message TEXT CHECK (error_message IS NULL OR length(error_message) <= 1000),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (kind = 'budget_threshold' AND reminder_occurrence_id IS NULL AND transaction_id IS NULL)
    OR (kind = 'reminder' AND budget_threshold_id IS NULL AND reminder_occurrence_id IS NOT NULL AND transaction_id IS NULL)
    OR (kind = 'transaction' AND budget_threshold_id IS NULL AND reminder_occurrence_id IS NULL AND transaction_id IS NOT NULL)
  )
) STRICT;

INSERT INTO notifications_new (
  id, recipient_user_id, kind, channel, budget_threshold_id,
  reminder_occurrence_id, title, body, dedupe_key, status,
  scheduled_for, delivered_at, read_at, error_message, created_at, updated_at
)
SELECT id, recipient_user_id, kind, channel, budget_threshold_id,
  reminder_occurrence_id, title, body, dedupe_key, status,
  scheduled_for, delivered_at, read_at, error_message, created_at, updated_at
FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX notifications_recipient_status_index
  ON notifications(recipient_user_id, status, created_at DESC);

CREATE INDEX notifications_delivery_index
  ON notifications(channel, status, next_attempt_at, scheduled_for)
  WHERE status IN ('pending', 'failed');
