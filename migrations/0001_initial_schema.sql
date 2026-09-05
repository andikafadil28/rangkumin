PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  telegram_user_id TEXT UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  currency TEXT NOT NULL DEFAULT 'IDR'
    CHECK (length(currency) = 3 AND currency = upper(currency)),
  currency_locked_at TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta'
    CHECK (length(trim(timezone)) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'saving')),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  normalized_name TEXT NOT NULL CHECK (length(trim(normalized_name)) BETWEEN 1 AND 80),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (is_default = 1 AND owner_user_id IS NULL)
    OR (is_default = 0 AND owner_user_id IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX categories_default_name_unique
  ON categories(type, normalized_name)
  WHERE owner_user_id IS NULL;

CREATE UNIQUE INDEX categories_custom_name_unique
  ON categories(owner_user_id, type, normalized_name)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX categories_owner_active_index
  ON categories(owner_user_id, is_active, type);

CREATE TABLE savings_goals (
  id TEXT PRIMARY KEY,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ownership_scope TEXT NOT NULL CHECK (ownership_scope IN ('personal', 'shared')),
  owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  normalized_name TEXT NOT NULL CHECK (length(trim(normalized_name)) BETWEEN 1 AND 100),
  target_amount INTEGER CHECK (target_amount IS NULL OR target_amount > 0),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (ownership_scope = 'personal' AND owner_user_id IS NOT NULL)
    OR (ownership_scope = 'shared' AND owner_user_id IS NULL)
  )
) STRICT;

CREATE UNIQUE INDEX savings_goals_personal_name_unique
  ON savings_goals(owner_user_id, normalized_name)
  WHERE ownership_scope = 'personal' AND archived_at IS NULL;

CREATE UNIQUE INDEX savings_goals_shared_name_unique
  ON savings_goals(normalized_name)
  WHERE ownership_scope = 'shared' AND archived_at IS NULL;

CREATE INDEX savings_goals_scope_index
  ON savings_goals(ownership_scope, owner_user_id, archived_at);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (
    type IN (
      'income',
      'expense',
      'saving_deposit',
      'saving_withdrawal',
      'saving_transfer'
    )
  ),
  category_id TEXT REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  source_savings_goal_id TEXT REFERENCES savings_goals(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  destination_savings_goal_id TEXT REFERENCES savings_goals(id) ON UPDATE CASCADE ON DELETE RESTRICT,
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
    )
    OR (
      type = 'saving_deposit'
      AND category_id IS NULL
      AND source_savings_goal_id IS NULL
      AND destination_savings_goal_id IS NOT NULL
    )
    OR (
      type = 'saving_withdrawal'
      AND category_id IS NULL
      AND source_savings_goal_id IS NOT NULL
      AND destination_savings_goal_id IS NULL
    )
    OR (
      type = 'saving_transfer'
      AND category_id IS NULL
      AND source_savings_goal_id IS NOT NULL
      AND destination_savings_goal_id IS NOT NULL
      AND source_savings_goal_id <> destination_savings_goal_id
    )
  )
) STRICT;

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

CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  ownership_scope TEXT NOT NULL CHECK (ownership_scope IN ('personal', 'shared')),
  owner_user_id TEXT REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  category_id TEXT NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  monthly_limit INTEGER NOT NULL CHECK (monthly_limit > 0),
  starts_on TEXT NOT NULL CHECK (
    length(starts_on) = 10
    AND starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-01'
  ),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (ownership_scope = 'personal' AND owner_user_id IS NOT NULL)
    OR (ownership_scope = 'shared' AND owner_user_id IS NULL)
  )
) STRICT;

CREATE UNIQUE INDEX budgets_personal_active_unique
  ON budgets(owner_user_id, category_id)
  WHERE ownership_scope = 'personal' AND is_active = 1;

CREATE UNIQUE INDEX budgets_shared_active_unique
  ON budgets(category_id)
  WHERE ownership_scope = 'shared' AND is_active = 1;

CREATE INDEX budgets_active_scope_index
  ON budgets(is_active, ownership_scope, owner_user_id);

CREATE TABLE budget_thresholds (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES budgets(id) ON UPDATE CASCADE ON DELETE CASCADE,
  percentage INTEGER NOT NULL CHECK (percentage BETWEEN 1 AND 100),
  notify_web INTEGER NOT NULL DEFAULT 1 CHECK (notify_web IN (0, 1)),
  notify_telegram INTEGER NOT NULL DEFAULT 0 CHECK (notify_telegram IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (budget_id, percentage),
  CHECK (notify_web = 1 OR notify_telegram = 1)
) STRICT;

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  creator_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(trim(description)) <= 500),
  amount INTEGER CHECK (amount IS NULL OR amount > 0),
  category_id TEXT REFERENCES categories(id) ON UPDATE CASCADE ON DELETE SET NULL,
  recurrence_type TEXT NOT NULL CHECK (
    recurrence_type IN ('once', 'interval_days', 'weekly', 'monthly')
  ),
  interval_value INTEGER,
  next_run_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta'
    CHECK (length(trim(timezone)) BETWEEN 1 AND 64),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (recurrence_type = 'once' AND interval_value IS NULL)
    OR (recurrence_type = 'interval_days' AND interval_value > 0)
    OR (recurrence_type = 'weekly' AND interval_value BETWEEN 0 AND 6)
    OR (recurrence_type = 'monthly' AND interval_value BETWEEN 1 AND 31)
  )
) STRICT;

CREATE TABLE reminder_recipients (
  reminder_id TEXT NOT NULL REFERENCES reminders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (reminder_id, user_id)
) STRICT;

CREATE INDEX reminders_due_index
  ON reminders(next_run_at)
  WHERE is_active = 1;

CREATE INDEX reminder_recipients_user_index
  ON reminder_recipients(user_id, reminder_id);

CREATE TABLE telegram_updates (
  update_id INTEGER PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX telegram_updates_processed_index
  ON telegram_updates(processed_at);

CREATE TABLE sheet_sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'running', 'success', 'failed')),
  requested_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  last_success_at TEXT,
  error_message TEXT CHECK (error_message IS NULL OR length(error_message) <= 1000),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO app_settings (id) VALUES (1);
INSERT INTO sheet_sync_state (id) VALUES (1);
