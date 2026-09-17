PRAGMA defer_foreign_keys = ON;

-- Fix: the GLOB color pattern in 0010 ('#[0-9A-Fa-f][0-9A-Fa-f]...' x6) is
-- rejected by D1/SQLite as "LIKE or GLOB pattern too complex", so inserting a
-- wallet with any non-null color always failed with 500.
-- SQLite cannot drop a single CHECK constraint, so rebuild the wallets table
-- with an equivalent predicate that avoids the oversized GLOB pattern.

CREATE TABLE wallets_new (
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
      AND substr(color, 1, 1) = '#'
      AND substr(color, 2, 6) NOT GLOB '*[^0-9A-Fa-f]*'
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

INSERT INTO wallets_new (
  id,
  owner_user_id,
  type,
  name,
  normalized_name,
  description,
  icon,
  color,
  group_name,
  initial_balance,
  default_wallet,
  sort_order,
  is_archived,
  archived_at,
  created_at,
  updated_at
)
SELECT
  id,
  owner_user_id,
  type,
  name,
  normalized_name,
  description,
  icon,
  color,
  group_name,
  initial_balance,
  default_wallet,
  sort_order,
  is_archived,
  archived_at,
  created_at,
  updated_at
FROM wallets;

DROP TABLE wallets;
ALTER TABLE wallets_new RENAME TO wallets;

CREATE UNIQUE INDEX wallets_active_name_unique
  ON wallets(owner_user_id, normalized_name)
  WHERE is_archived = 0;

CREATE UNIQUE INDEX wallets_owner_default_unique
  ON wallets(owner_user_id)
  WHERE default_wallet = 1;

CREATE INDEX idx_wallets_owner
  ON wallets(owner_user_id, is_archived, sort_order, created_at);

PRAGMA foreign_key_check;