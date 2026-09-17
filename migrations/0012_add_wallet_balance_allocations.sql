CREATE TABLE wallet_balance_allocations (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  wallet_id TEXT NOT NULL REFERENCES wallets(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('to_wallet', 'to_unallocated')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  description TEXT CHECK (description IS NULL OR length(trim(description)) <= 500),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_wallet_balance_allocations_owner
  ON wallet_balance_allocations(owner_user_id, created_at DESC);

CREATE INDEX idx_wallet_balance_allocations_wallet
  ON wallet_balance_allocations(wallet_id, created_at DESC);
