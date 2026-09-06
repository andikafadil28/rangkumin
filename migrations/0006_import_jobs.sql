CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN (
    'categories', 'transactions', 'savings_goals',
    'savings_mutations', 'budgets', 'reminders'
  )),
  file_digest TEXT NOT NULL CHECK (length(file_digest) = 64),
  mapping_json TEXT NOT NULL,
  plan_digest TEXT NOT NULL CHECK (length(plan_digest) = 64),
  duplicate_policy TEXT NOT NULL CHECK (duplicate_policy IN ('skip', 'reject')),
  total_rows INTEGER NOT NULL CHECK (total_rows BETWEEN 1 AND 500),
  accepted_rows INTEGER NOT NULL CHECK (accepted_rows BETWEEN 0 AND 500),
  duplicate_rows INTEGER NOT NULL CHECK (duplicate_rows BETWEEN 0 AND 500),
  status TEXT NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed', 'committed')),
  committed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (actor_user_id, idempotency_key),
  CHECK (
    (status = 'previewed' AND committed_at IS NULL)
    OR (status = 'committed' AND committed_at IS NOT NULL)
  )
) STRICT;

CREATE INDEX import_jobs_actor_created_index
  ON import_jobs(actor_user_id, created_at DESC);

CREATE TABLE import_records (
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON UPDATE CASCADE ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  domain TEXT NOT NULL,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  created_record_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (import_job_id, row_number),
  UNIQUE (actor_user_id, domain, fingerprint)
) STRICT;

CREATE INDEX import_records_created_record_index
  ON import_records(domain, created_record_id);
