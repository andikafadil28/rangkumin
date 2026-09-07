-- Telegram has no active transport. Preserve columns for historical
-- compatibility while moving all active preferences to Dashboard/Web Push.
UPDATE reminders
SET notify_web = CASE
      WHEN notify_web = 1 OR notify_telegram = 1 THEN 1
      ELSE notify_web
    END,
    notify_telegram = 0,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE notify_telegram <> 0;

UPDATE budget_thresholds
SET notify_web = CASE
      WHEN notify_web = 1 OR notify_telegram = 1 THEN 1
      ELSE notify_web
    END,
    notify_telegram = 0
WHERE notify_telegram <> 0;
