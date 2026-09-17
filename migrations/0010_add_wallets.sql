PRAGMA defer_foreign_keys = ON;

CREATE TABLE wallets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('cash', 'bank', 'e_wallet', 'other')),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  normalized_name TEXT NOT NULL CHECK (length(trim(normalized_name)) BETWEEN 1 AND 100),
  description TEXT CHECK (description IS NULL OR length(trim(description)) <= 500),
  icon TEXT CHECK (icon IS NULL OR length(trim(icon)) BETWEEN 1 AND 50),
  color TEXT CHECK (
    color IS NULL
    OR (
      length(color) = 7
      AND color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
    )
  ),
  group_name TEXT NOT NULL CHECK (length(trim(group_name)) BETWEEN 1 AND 100),
  initial_balance INTEGER NOT NULL DEFAULT 0 CHECK (initial_balance >= 0),
  default_wallet INTEGER NOT NULL DEFAULT 0 CHECK (default_wallet IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (is_archived = 0 AND archived_at IS NULL)
    OR (is_archived = 1 AND archived_at IS NOT NULL)
  ),
  CHECK (is_archived = 0 OR default_wallet = 0)
) STRICT;

CREATE UNIQUE INDEX wallets_active_name_unique
  ON wallets(owner_user_id, normalized_name)
  WHERE is_archived = 0;

CREATE UNIQUE INDEX wallets_owner_default_unique
  ON wallets(owner_user_id)
  WHERE default_wallet = 1;

CREATE INDEX idx_wallets_owner
  ON wallets(owner_user_id, is_archived, sort_order, created_at);

-- Rebuilding transactions triggers FK actions even when checks are deferred.
-- Preserve dependent history and restore it after the parent table is replaced.
CREATE TABLE wallet_migration_occurrence_refs AS
SELECT id AS occurrence_id, expense_transaction_id AS transaction_id
FROM reminder_occurrences
WHERE expense_transaction_id IS NOT NULL;

CREATE TABLE wallet_migration_notifications AS
SELECT *
FROM notifications
WHERE transaction_id IS NOT NULL;

CREATE TABLE wallet_migration_push_deliveries AS
SELECT delivery.*
FROM web_push_deliveries AS delivery
JOIN wallet_migration_notifications AS notification
  ON notification.id = delivery.notification_id;

CREATE TABLE transactions_new (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (
    type IN (
      'income',
      'expense',
      'saving_deposit',
      'saving_withdrawal',
      'saving_transfer',
      'wallet_transfer'
    )
  ),
  category_id TEXT REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  source_savings_goal_id TEXT REFERENCES savings_goals(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  destination_savings_goal_id TEXT REFERENCES savings_goals(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  wallet_id TEXT REFERENCES wallets(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  source_wallet_id TEXT REFERENCES wallets(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  destination_wallet_id TEXT REFERENCES wallets(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  reconciliation_status TEXT NOT NULL DEFAULT 'unreconciled'
    CHECK (reconciliation_status IN ('unreconciled', 'reconciled', 'excluded')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  description TEXT CHECK (description IS NULL OR length(trim(description)) <= 500),
  transaction_date TEXT NOT NULL CHECK (
    length(transaction_date) = 10
    AND transaction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'telegram', 'import')),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 128),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  deleted_at TEXT,
  purge_after TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (deleted_at IS NULL AND purge_after IS NULL)
    OR (deleted_at IS NOT NULL AND purge_after IS NOT NULL)
  ),
  CHECK (
    (
      type IN ('income', 'expense')
      AND category_id IS NOT NULL
      AND source_savings_goal_id IS NULL
      AND destination_savings_goal_id IS NULL
      AND source_wallet_id IS NULL
      AND destination_wallet_id IS NULL
    )
    OR (
      type = 'saving_deposit'
      AND category_id IS NULL
      AND source_savings_goal_id IS NULL
      AND destination_savings_goal_id IS NOT NULL
      AND source_wallet_id IS NULL
      AND destination_wallet_id IS NULL
    )
    OR (
      type = 'saving_withdrawal'
      AND category_id IS NULL
      AND source_savings_goal_id IS NOT NULL
      AND destination_savings_goal_id IS NULL
      AND source_wallet_id IS NULL
      AND destination_wallet_id IS NULL
    )
    OR (
      type = 'saving_transfer'
      AND category_id IS NULL
      AND source_savings_goal_id IS NOT NULL
      AND destination_savings_goal_id IS NOT NULL
      AND source_savings_goal_id <> destination_savings_goal_id
      AND wallet_id IS NULL
      AND source_wallet_id IS NULL
      AND destination_wallet_id IS NULL
    )
    OR (
      type = 'wallet_transfer'
      AND category_id IS NULL
      AND source_savings_goal_id IS NULL
      AND destination_savings_goal_id IS NULL
      AND wallet_id IS NULL
      AND source_wallet_id IS NOT NULL
      AND destination_wallet_id IS NOT NULL
      AND source_wallet_id <> destination_wallet_id
    )
  )
) STRICT;

INSERT INTO transactions_new (
  id,
  owner_user_id,
  type,
  category_id,
  source_savings_goal_id,
  destination_savings_goal_id,
  wallet_id,
  source_wallet_id,
  destination_wallet_id,
  reconciliation_status,
  amount,
  description,
  transaction_date,
  source,
  idempotency_key,
  version,
  deleted_at,
  purge_after,
  created_at,
  updated_at
)
SELECT
  id,
  owner_user_id,
  type,
  category_id,
  source_savings_goal_id,
  destination_savings_goal_id,
  NULL,
  NULL,
  NULL,
  'unreconciled',
  amount,
  description,
  transaction_date,
  source,
  idempotency_key,
  version,
  deleted_at,
  purge_after,
  created_at,
  updated_at
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

UPDATE reminder_occurrences
SET expense_transaction_id = (
  SELECT transaction_id
  FROM wallet_migration_occurrence_refs
  WHERE occurrence_id = reminder_occurrences.id
)
WHERE id IN (SELECT occurrence_id FROM wallet_migration_occurrence_refs);

INSERT INTO notifications (
  id,
  recipient_user_id,
  kind,
  channel,
  budget_threshold_id,
  reminder_occurrence_id,
  transaction_id,
  title,
  body,
  dedupe_key,
  status,
  scheduled_for,
  delivered_at,
  read_at,
  error_message,
  attempt_count,
  next_attempt_at,
  created_at,
  updated_at
)
SELECT
  id,
  recipient_user_id,
  kind,
  channel,
  budget_threshold_id,
  reminder_occurrence_id,
  transaction_id,
  title,
  body,
  dedupe_key,
  status,
  scheduled_for,
  delivered_at,
  read_at,
  error_message,
  attempt_count,
  next_attempt_at,
  created_at,
  updated_at
FROM wallet_migration_notifications;

INSERT INTO web_push_deliveries (
  id,
  subscription_device_id,
  notification_id,
  status,
  attempt_count,
  next_attempt_at,
  lease_until,
  claim_token,
  response_status,
  error_message,
  delivered_at,
  created_at,
  updated_at
)
SELECT
  id,
  subscription_device_id,
  notification_id,
  status,
  attempt_count,
  next_attempt_at,
  lease_until,
  claim_token,
  response_status,
  error_message,
  delivered_at,
  created_at,
  updated_at
FROM wallet_migration_push_deliveries;

DROP TABLE wallet_migration_push_deliveries;
DROP TABLE wallet_migration_notifications;
DROP TABLE wallet_migration_occurrence_refs;

CREATE INDEX transactions_active_date_index
  ON transactions(transaction_date DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX transactions_owner_date_index
  ON transactions(owner_user_id, transaction_date DESC, created_at DESC);

CREATE INDEX transactions_category_date_index
  ON transactions(category_id, transaction_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX transactions_type_date_index
  ON transactions(type, transaction_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX transactions_source_goal_index
  ON transactions(source_savings_goal_id, transaction_date DESC)
  WHERE deleted_at IS NULL AND source_savings_goal_id IS NOT NULL;

CREATE INDEX transactions_destination_goal_index
  ON transactions(destination_savings_goal_id, transaction_date DESC)
  WHERE deleted_at IS NULL AND destination_savings_goal_id IS NOT NULL;

CREATE INDEX transactions_purge_index
  ON transactions(purge_after)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX idx_transactions_wallet
  ON transactions(wallet_id, transaction_date DESC)
  WHERE deleted_at IS NULL AND wallet_id IS NOT NULL;

CREATE INDEX idx_transactions_wallet_source
  ON transactions(source_wallet_id, transaction_date DESC)
  WHERE deleted_at IS NULL AND source_wallet_id IS NOT NULL;

CREATE INDEX idx_transactions_wallet_dest
  ON transactions(destination_wallet_id, transaction_date DESC)
  WHERE deleted_at IS NULL AND destination_wallet_id IS NOT NULL;

PRAGMA foreign_key_check;
