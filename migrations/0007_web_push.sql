CREATE TABLE web_push_subscriptions (
  device_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE CHECK (
    length(endpoint) BETWEEN 10 AND 2048
    AND endpoint LIKE 'https://%'
  ),
  p256dh TEXT NOT NULL CHECK (length(p256dh) BETWEEN 80 AND 120),
  auth TEXT NOT NULL CHECK (length(auth) BETWEEN 20 AND 32),
  expiration_time INTEGER CHECK (expiration_time IS NULL OR expiration_time >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX web_push_subscriptions_user_index
  ON web_push_subscriptions(user_id, created_at);

CREATE TABLE web_push_deliveries (
  id TEXT PRIMARY KEY,
  subscription_device_id TEXT NOT NULL
    REFERENCES web_push_subscriptions(device_id) ON UPDATE CASCADE ON DELETE CASCADE,
  notification_id TEXT NOT NULL
    REFERENCES notifications(id) ON UPDATE CASCADE ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT,
  lease_until TEXT,
  claim_token TEXT,
  response_status INTEGER CHECK (
    response_status IS NULL OR response_status BETWEEN 100 AND 599
  ),
  error_message TEXT CHECK (error_message IS NULL OR length(error_message) <= 1000),
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (subscription_device_id, notification_id),
  CHECK (
    (status = 'processing' AND lease_until IS NOT NULL AND claim_token IS NOT NULL)
    OR (status <> 'processing' AND lease_until IS NULL AND claim_token IS NULL)
  )
) STRICT;

CREATE INDEX web_push_deliveries_queue_index
  ON web_push_deliveries(status, next_attempt_at, lease_until, created_at)
  WHERE status IN ('pending', 'processing', 'failed');

CREATE INDEX web_push_deliveries_notification_index
  ON web_push_deliveries(notification_id);

-- Existing Telegram-only settings should also create dashboard events for Web Push.
-- Telegram remains enabled, preserving its delivery history and user preference.
UPDATE reminders
SET notify_web = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE is_active = 1 AND notify_web = 0 AND notify_telegram = 1;

UPDATE budget_thresholds
SET notify_web = 1
WHERE notify_web = 0
  AND notify_telegram = 1
  AND EXISTS (
    SELECT 1 FROM budgets
    WHERE budgets.id = budget_thresholds.budget_id
      AND budgets.is_active = 1
  );
