CREATE TABLE occurrence_merge (
  loser_id TEXT PRIMARY KEY,
  winner_id TEXT NOT NULL
);

INSERT INTO occurrence_merge (loser_id, winner_id)
SELECT loser.id,
  (
    SELECT winner.id
    FROM reminder_occurrences AS winner
    WHERE winner.reminder_id = loser.reminder_id
      AND strftime('%Y-%m-%dT%H:%M:%fZ', winner.scheduled_for)
        = strftime('%Y-%m-%dT%H:%M:%fZ', loser.scheduled_for)
    ORDER BY
      CASE winner.status
        WHEN 'completed' THEN 3
        WHEN 'snoozed' THEN 2
        ELSE 1
      END DESC,
      winner.rowid
    LIMIT 1
  )
FROM reminder_occurrences AS loser
WHERE loser.id <> (
  SELECT winner.id
  FROM reminder_occurrences AS winner
  WHERE winner.reminder_id = loser.reminder_id
    AND strftime('%Y-%m-%dT%H:%M:%fZ', winner.scheduled_for)
      = strftime('%Y-%m-%dT%H:%M:%fZ', loser.scheduled_for)
  ORDER BY
    CASE winner.status
      WHEN 'completed' THEN 3
      WHEN 'snoozed' THEN 2
      ELSE 1
    END DESC,
    winner.rowid
  LIMIT 1
);

UPDATE reminder_occurrences AS winner
SET expense_transaction_id = COALESCE(
  winner.expense_transaction_id,
  (
    SELECT loser.expense_transaction_id
    FROM occurrence_merge AS merge
    JOIN reminder_occurrences AS loser ON loser.id = merge.loser_id
    WHERE merge.winner_id = winner.id
      AND loser.expense_transaction_id IS NOT NULL
    LIMIT 1
  )
)
WHERE winner.id IN (SELECT winner_id FROM occurrence_merge);

UPDATE OR IGNORE notifications
SET reminder_occurrence_id = (
      SELECT winner_id FROM occurrence_merge
      WHERE loser_id = notifications.reminder_occurrence_id
    ),
    dedupe_key = replace(
      dedupe_key,
      scheduled_for,
      strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_for)
    ),
    scheduled_for = strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_for)
WHERE reminder_occurrence_id IN (SELECT loser_id FROM occurrence_merge);

DELETE FROM reminder_occurrences
WHERE id IN (SELECT loser_id FROM occurrence_merge);

DROP TABLE occurrence_merge;

UPDATE reminder_occurrences
SET scheduled_for = strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_for)
WHERE scheduled_for <> strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_for);

CREATE TABLE notifications_new (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('budget_threshold', 'reminder')),
  channel TEXT NOT NULL CHECK (channel IN ('dashboard', 'telegram')),
  budget_threshold_id TEXT REFERENCES budget_thresholds(id) ON UPDATE CASCADE ON DELETE SET NULL,
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
    (kind = 'budget_threshold' AND reminder_occurrence_id IS NULL)
    OR (kind = 'reminder' AND budget_threshold_id IS NULL AND reminder_occurrence_id IS NOT NULL)
  )
) STRICT;

INSERT INTO notifications_new (
  id, recipient_user_id, kind, channel, budget_threshold_id,
  reminder_occurrence_id, title, body, dedupe_key, status,
  scheduled_for, delivered_at, read_at, error_message, created_at, updated_at
)
SELECT
  n.id, n.recipient_user_id, n.kind, n.channel, n.budget_threshold_id,
  n.reminder_occurrence_id, n.title, n.body,
  CASE
    WHEN n.kind = 'budget_threshold' THEN replace(
      n.dedupe_key,
      ':' || n.budget_threshold_id || ':',
      ':' || bt.percentage || ':'
    )
    ELSE n.dedupe_key
  END,
  n.status, n.scheduled_for, n.delivered_at, n.read_at, n.error_message,
  n.created_at, n.updated_at
FROM notifications n
LEFT JOIN budget_thresholds bt ON bt.id = n.budget_threshold_id;

DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;

CREATE INDEX notifications_recipient_status_index
  ON notifications(recipient_user_id, status, created_at DESC);

CREATE INDEX notifications_delivery_index
  ON notifications(channel, status, scheduled_for)
  WHERE status IN ('pending', 'failed');

UPDATE reminders
SET next_run_at = strftime('%Y-%m-%dT%H:%M:%fZ', next_run_at)
WHERE next_run_at <> strftime('%Y-%m-%dT%H:%M:%fZ', next_run_at);

UPDATE reminder_occurrences
SET snoozed_until = strftime('%Y-%m-%dT%H:%M:%fZ', snoozed_until)
WHERE snoozed_until IS NOT NULL
  AND snoozed_until <> strftime('%Y-%m-%dT%H:%M:%fZ', snoozed_until);

UPDATE OR IGNORE notifications
SET dedupe_key = replace(
      dedupe_key,
      scheduled_for,
      strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_for)
    ),
    scheduled_for = strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_for)
WHERE scheduled_for <> strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_for);

DELETE FROM notifications
WHERE scheduled_for <> strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_for)
  AND EXISTS (
    SELECT 1 FROM notifications AS canonical
    WHERE canonical.id <> notifications.id
      AND canonical.dedupe_key = replace(
        notifications.dedupe_key,
        notifications.scheduled_for,
        strftime('%Y-%m-%dT%H:%M:%fZ', notifications.scheduled_for)
      )
  );

UPDATE notifications
SET dedupe_key = replace(
      dedupe_key,
      scheduled_for,
      strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_for)
    ),
    scheduled_for = strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_for)
WHERE scheduled_for <> strftime('%Y-%m-%dT%H:%M:%fZ', scheduled_for);
