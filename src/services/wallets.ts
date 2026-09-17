import { normalizeCategoryName } from "./categories";
import {
  ConflictError,
  IdempotencyConflictError,
  InsufficientBalanceError,
  NotFoundError,
} from "./errors";

export type WalletType = "cash" | "bank" | "e_wallet" | "other";
export type WalletAllocationDirection = "to_wallet" | "to_unallocated";

export type WalletRow = {
  id: string;
  owner_user_id: string;
  type: WalletType;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  group_name: string;
  initial_balance: number;
  default_wallet: number;
  sort_order: number;
  is_archived: number;
  archived_at: string | null;
  balance: number;
  created_at: string;
  updated_at: string;
};

export type WalletDetail = {
  id: string;
  ownerUserId: string;
  type: WalletType;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  groupName: string;
  initialBalance: number;
  defaultWallet: boolean;
  sortOrder: number;
  isArchived: boolean;
  archivedAt: string | null;
  balance: number;
  createdAt: string;
  updatedAt: string;
};

export type WalletTransferDetail = {
  id: string;
  actorUserId: string;
  sourceWallet: { id: string; name: string };
  destinationWallet: { id: string; name: string };
  amount: number;
  description: string | null;
  transactionDate: string;
  source: "web" | "telegram" | "import";
  createdAt: string;
};

type WalletTransferRow = {
  id: string;
  owner_user_id: string;
  source_wallet_id: string;
  destination_wallet_id: string;
  amount: number;
  description: string | null;
  transaction_date: string;
  source: "web" | "telegram" | "import";
  idempotency_key: string;
  created_at: string;
  source_wallet_name: string;
  destination_wallet_name: string;
};

type TransferWalletInput = {
  actorUserId: string;
  sourceWalletId: string;
  destinationWalletId: string;
  amount: number;
  description: string | null;
  transactionDate: string;
  idempotencyKey: string;
};

export type WalletAllocationDetail = {
  id: string;
  ownerUserId: string;
  walletId: string;
  direction: WalletAllocationDirection;
  amount: number;
  description: string | null;
  createdAt: string;
};

export type WalletOverview = {
  ownerUserId: string;
  cashBalance: number;
  walletBalance: number;
  unallocatedBalance: number;
};

type WalletAllocationRow = {
  id: string;
  owner_user_id: string;
  wallet_id: string;
  direction: WalletAllocationDirection;
  amount: number;
  description: string | null;
  created_at: string;
};

type WalletOverviewRow = {
  owner_user_id: string;
  cash_balance: number;
  wallet_balance: number;
};

const walletBalanceSqlFor = (
  walletAlias: string,
) => `${walletAlias}.initial_balance + COALESCE((
  SELECT SUM(CASE
    WHEN t.type = 'income' AND t.wallet_id = ${walletAlias}.id THEN t.amount
    WHEN t.type IN ('expense', 'saving_deposit') AND t.wallet_id = ${walletAlias}.id THEN -t.amount
    WHEN t.type = 'saving_withdrawal' AND t.wallet_id = ${walletAlias}.id THEN t.amount
    WHEN t.type = 'wallet_transfer' AND t.source_wallet_id = ${walletAlias}.id THEN -t.amount
    WHEN t.type = 'wallet_transfer' AND t.destination_wallet_id = ${walletAlias}.id THEN t.amount
    ELSE 0
  END)
  FROM transactions t
  WHERE t.deleted_at IS NULL
    AND (
      t.wallet_id = ${walletAlias}.id
      OR t.source_wallet_id = ${walletAlias}.id
      OR t.destination_wallet_id = ${walletAlias}.id
    )
), 0) + COALESCE((
  SELECT SUM(CASE
    WHEN a.direction = 'to_wallet' THEN a.amount
    WHEN a.direction = 'to_unallocated' THEN -a.amount
    ELSE 0
  END)
  FROM wallet_balance_allocations a
  WHERE a.wallet_id = ${walletAlias}.id
), 0)`;

const walletBalanceSql = walletBalanceSqlFor("w");

const cashBalanceSqlFor = (ownerSql: string) => `COALESCE((
  SELECT SUM(CASE
    WHEN t.type = 'income' THEN t.amount
    WHEN t.type = 'expense' THEN -t.amount
    WHEN t.type = 'saving_deposit' THEN -t.amount
    WHEN t.type = 'saving_withdrawal' THEN t.amount
    ELSE 0
  END)
  FROM transactions t
  WHERE t.owner_user_id = ${ownerSql} AND t.deleted_at IS NULL
), 0)`;

const ownerWalletBalanceSqlFor = (ownerSql: string) => `COALESCE((
  SELECT SUM(${walletBalanceSqlFor("w")})
  FROM wallets w
  WHERE w.owner_user_id = ${ownerSql}
), 0)`;

const walletSelect = `SELECT
  w.id, w.owner_user_id, w.type, w.name, w.description, w.icon, w.color,
  w.group_name, w.initial_balance, w.default_wallet, w.sort_order,
  w.is_archived, w.archived_at, w.created_at, w.updated_at,
  ${walletBalanceSql} AS balance
FROM wallets w`;

const walletTransferSelect = `SELECT
  t.id, t.owner_user_id, t.source_wallet_id, t.destination_wallet_id,
  t.amount, t.description, t.transaction_date, t.source,
  t.idempotency_key, t.created_at,
  source_wallet.name AS source_wallet_name,
  destination_wallet.name AS destination_wallet_name
FROM transactions t
JOIN wallets source_wallet ON source_wallet.id = t.source_wallet_id
JOIN wallets destination_wallet ON destination_wallet.id = t.destination_wallet_id`;

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized ? normalized : null;
}

function normalizeColor(value: string | null | undefined): string | null {
  return normalizeText(value)?.toUpperCase() ?? null;
}

function defaultGroup(type: WalletType): string {
  return type;
}

function isConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /constraint failed|unique constraint/i.test(error.message)
  );
}

export function serializeWallet(row: WalletRow): WalletDetail {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    type: row.type,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    groupName: row.group_name,
    initialBalance: row.initial_balance,
    defaultWallet: row.default_wallet === 1,
    sortOrder: row.sort_order,
    isArchived: row.is_archived === 1,
    archivedAt: row.archived_at,
    balance: row.balance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeWalletTransfer(row: WalletTransferRow): WalletTransferDetail {
  return {
    id: row.id,
    actorUserId: row.owner_user_id,
    sourceWallet: {
      id: row.source_wallet_id,
      name: row.source_wallet_name,
    },
    destinationWallet: {
      id: row.destination_wallet_id,
      name: row.destination_wallet_name,
    },
    amount: row.amount,
    description: row.description,
    transactionDate: row.transaction_date,
    source: row.source,
    createdAt: row.created_at,
  };
}

function serializeWalletAllocation(
  row: WalletAllocationRow,
): WalletAllocationDetail {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    walletId: row.wallet_id,
    direction: row.direction,
    amount: row.amount,
    description: row.description,
    createdAt: row.created_at,
  };
}

function serializeWalletOverview(row: WalletOverviewRow): WalletOverview {
  return {
    ownerUserId: row.owner_user_id,
    cashBalance: row.cash_balance,
    walletBalance: row.wallet_balance,
    unallocatedBalance: row.cash_balance - row.wallet_balance,
  };
}

export async function listWallets(
  database: D1Database,
  filters: { ownerUserId?: string; includeArchived?: boolean } = {},
): Promise<WalletDetail[]> {
  const conditions: string[] = [];
  const parameters: Array<string | number> = [];

  if (filters.ownerUserId) {
    parameters.push(filters.ownerUserId);
    conditions.push(`w.owner_user_id = ?${parameters.length}`);
  }
  if (!filters.includeArchived) {
    conditions.push("w.is_archived = 0");
  }

  const whereSql = conditions.length
    ? ` WHERE ${conditions.join(" AND ")}`
    : "";
  const { results } = await database
    .prepare(
      `${walletSelect}${whereSql}
       ORDER BY w.is_archived, w.owner_user_id, w.group_name,
         w.default_wallet DESC, w.sort_order, w.created_at`,
    )
    .bind(...parameters)
    .all<WalletRow>();

  return results.map(serializeWallet);
}

export async function listWalletOverviews(
  database: D1Database,
): Promise<WalletOverview[]> {
  const { results } = await database
    .prepare(
      `SELECT
         u.id AS owner_user_id,
         ${cashBalanceSqlFor("u.id")} AS cash_balance,
         ${ownerWalletBalanceSqlFor("u.id")} AS wallet_balance
       FROM users u
       WHERE u.is_active = 1
       ORDER BY u.id`,
    )
    .all<WalletOverviewRow>();

  return results.map(serializeWalletOverview);
}

export async function getWalletOverview(
  database: D1Database,
  ownerUserId: string,
): Promise<WalletOverview> {
  const row = await database
    .prepare(
      `SELECT
         u.id AS owner_user_id,
         ${cashBalanceSqlFor("u.id")} AS cash_balance,
         ${ownerWalletBalanceSqlFor("u.id")} AS wallet_balance
       FROM users u
       WHERE u.id = ?1 AND u.is_active = 1
       LIMIT 1`,
    )
    .bind(ownerUserId)
    .first<WalletOverviewRow>();
  if (!row) throw new NotFoundError("Pengguna tidak ditemukan.");
  return serializeWalletOverview(row);
}

export async function getWallet(
  database: D1Database,
  walletId: string,
): Promise<WalletDetail | null> {
  const row = await database
    .prepare(`${walletSelect} WHERE w.id = ?1 LIMIT 1`)
    .bind(walletId)
    .first<WalletRow>();

  return row ? serializeWallet(row) : null;
}

async function getOwnedWallet(
  database: D1Database,
  walletId: string,
  ownerUserId: string,
): Promise<WalletDetail> {
  const row = await database
    .prepare(`${walletSelect} WHERE w.id = ?1 AND w.owner_user_id = ?2 LIMIT 1`)
    .bind(walletId, ownerUserId)
    .first<WalletRow>();

  if (!row) {
    throw new NotFoundError("Dompet tidak ditemukan.");
  }

  return serializeWallet(row);
}

async function activeWalletNameExists(
  database: D1Database,
  input: { ownerUserId: string; normalizedName: string; exceptId?: string },
): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT id
       FROM wallets
       WHERE owner_user_id = ?1
         AND normalized_name = ?2
         AND is_archived = 0
         AND (?3 IS NULL OR id <> ?3)
       LIMIT 1`,
    )
    .bind(input.ownerUserId, input.normalizedName, input.exceptId ?? null)
    .first<{ id: string }>();

  return Boolean(row);
}

async function hasActiveWallet(
  database: D1Database,
  ownerUserId: string,
): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT id FROM wallets
       WHERE owner_user_id = ?1 AND is_archived = 0
       LIMIT 1`,
    )
    .bind(ownerUserId)
    .first<{ id: string }>();
  return Boolean(row);
}

export async function createWallet(
  database: D1Database,
  input: {
    ownerUserId: string;
    type: WalletType;
    name: string;
    description?: string | null;
    icon?: string | null;
    color?: string | null;
    groupName?: string;
    initialBalance?: number;
    defaultWallet?: boolean;
    sortOrder?: number;
  },
): Promise<WalletDetail> {
  const name = normalizeText(input.name) ?? input.name;
  const normalizedName = normalizeCategoryName(name);
  if (
    await activeWalletNameExists(database, {
      ownerUserId: input.ownerUserId,
      normalizedName,
    })
  ) {
    throw new ConflictError("Nama dompet sudah digunakan.");
  }

  const id = crypto.randomUUID();
  const shouldBeDefault =
    input.defaultWallet ||
    !(await hasActiveWallet(database, input.ownerUserId));
  const now = new Date().toISOString();
  const initialAllocation = input.initialBalance ?? 0;
  const insert = database
    .prepare(
      `INSERT INTO wallets (
         id, owner_user_id, type, name, normalized_name, description,
         icon, color, group_name, initial_balance, default_wallet,
         sort_order, created_at, updated_at
       ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, 0, ?10, ?11, ?12
       WHERE ?13 = 0 OR (
         ${cashBalanceSqlFor("?2")} - ${ownerWalletBalanceSqlFor("?2")} >= ?13
       )`,
    )
    .bind(
      id,
      input.ownerUserId,
      input.type,
      name,
      normalizedName,
      normalizeText(input.description),
      normalizeText(input.icon),
      normalizeColor(input.color),
      normalizeText(input.groupName) ?? defaultGroup(input.type),
      input.sortOrder ?? 0,
      now,
      now,
      initialAllocation,
    );

  try {
    const statements = [insert];
    if (shouldBeDefault) {
      statements.push(
        database
          .prepare(
            `UPDATE wallets
             SET default_wallet = 0, updated_at = ?1
             WHERE owner_user_id = ?2 AND default_wallet = 1
               AND EXISTS (SELECT 1 FROM wallets WHERE id = ?3)`,
          )
          .bind(now, input.ownerUserId, id),
        database
          .prepare(
            `UPDATE wallets
             SET default_wallet = 1, updated_at = ?1
             WHERE id = ?2 AND owner_user_id = ?3`,
          )
          .bind(now, id, input.ownerUserId),
      );
    }
    if (initialAllocation > 0) {
      statements.push(
        database
          .prepare(
            `INSERT INTO wallet_balance_allocations (
               id, owner_user_id, wallet_id, direction, amount, description, created_at
             )
             SELECT ?1, ?2, ?3, 'to_wallet', ?4, NULL, ?5
             FROM wallets WHERE id = ?3 AND owner_user_id = ?2`,
          )
          .bind(
            crypto.randomUUID(),
            input.ownerUserId,
            id,
            initialAllocation,
            now,
          ),
      );
    }
    const results = await database.batch(statements);
    if (results[0]?.meta.changes !== 1) {
      throw new InsufficientBalanceError("Saldo tanpa dompet tidak mencukupi.");
    }
  } catch (error) {
    if (error instanceof InsufficientBalanceError) throw error;
    if (isConstraintError(error)) {
      throw new ConflictError("Nama dompet sudah digunakan.");
    }
    throw error;
  }

  const wallet = await getWallet(database, id);
  if (!wallet) {
    throw new NotFoundError("Dompet tidak ditemukan setelah dibuat.");
  }
  return wallet;
}

export async function createWalletAllocation(
  database: D1Database,
  input: {
    ownerUserId: string;
    walletId: string;
    direction: WalletAllocationDirection;
    amount: number;
    description?: string | null;
  },
): Promise<{
  allocation: WalletAllocationDetail;
  wallet: WalletDetail;
  overview: WalletOverview;
}> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const description = normalizeText(input.description);
  const result = await database
    .prepare(
      `INSERT INTO wallet_balance_allocations (
         id, owner_user_id, wallet_id, direction, amount, description, created_at
       )
       SELECT ?1, ?2, target.id, ?4, ?5, ?6, ?7
       FROM wallets target
       WHERE target.id = ?3
         AND target.owner_user_id = ?2
         AND target.is_archived = 0
         AND (
           (?4 = 'to_wallet' AND
             ${cashBalanceSqlFor("?2")} - ${ownerWalletBalanceSqlFor("?2")} >= ?5)
           OR
           (?4 = 'to_unallocated' AND ${walletBalanceSqlFor("target")} >= ?5)
         )`,
    )
    .bind(
      id,
      input.ownerUserId,
      input.walletId,
      input.direction,
      input.amount,
      description,
      now,
    )
    .run();

  if (result.meta.changes !== 1) {
    if (
      !(await canUseActiveWallet(database, input.walletId, input.ownerUserId))
    ) {
      throw new NotFoundError("Dompet tidak ditemukan.");
    }
    throw new InsufficientBalanceError(
      input.direction === "to_wallet"
        ? "Saldo tanpa dompet tidak mencukupi."
        : "Saldo dompet tidak mencukupi.",
    );
  }

  const allocation = await database
    .prepare(
      `SELECT id, owner_user_id, wallet_id, direction, amount, description, created_at
       FROM wallet_balance_allocations
       WHERE id = ?1 LIMIT 1`,
    )
    .bind(id)
    .first<WalletAllocationRow>();
  const wallet = await getWallet(database, input.walletId);
  if (!allocation || !wallet) {
    throw new NotFoundError("Alokasi saldo tidak ditemukan setelah dibuat.");
  }

  return {
    allocation: serializeWalletAllocation(allocation),
    wallet,
    overview: await getWalletOverview(database, input.ownerUserId),
  };
}

export async function listWalletAllocations(
  database: D1Database,
  walletId: string,
): Promise<WalletAllocationDetail[]> {
  if (!(await getWallet(database, walletId))) {
    throw new NotFoundError("Dompet tidak ditemukan.");
  }
  const { results } = await database
    .prepare(
      `SELECT id, owner_user_id, wallet_id, direction, amount, description, created_at
       FROM wallet_balance_allocations
       WHERE wallet_id = ?1
       ORDER BY created_at DESC, id DESC`,
    )
    .bind(walletId)
    .all<WalletAllocationRow>();
  return results.map(serializeWalletAllocation);
}

export async function updateWallet(
  database: D1Database,
  input: {
    walletId: string;
    ownerUserId: string;
    type?: WalletType;
    name?: string;
    description?: string | null;
    icon?: string | null;
    color?: string | null;
    groupName?: string;
    sortOrder?: number;
  },
): Promise<WalletDetail> {
  const current = await getOwnedWallet(
    database,
    input.walletId,
    input.ownerUserId,
  );
  const name = normalizeText(input.name) ?? current.name;
  const normalizedName = normalizeCategoryName(name);
  if (
    !current.isArchived &&
    (await activeWalletNameExists(database, {
      ownerUserId: input.ownerUserId,
      normalizedName,
      exceptId: input.walletId,
    }))
  ) {
    throw new ConflictError("Nama dompet sudah digunakan.");
  }

  const result = await database
    .prepare(
      `UPDATE wallets
       SET type = ?1, name = ?2, normalized_name = ?3, description = ?4,
           icon = ?5, color = ?6, group_name = ?7, sort_order = ?8,
           updated_at = ?9
       WHERE id = ?10 AND owner_user_id = ?11`,
    )
    .bind(
      input.type ?? current.type,
      name,
      normalizedName,
      input.description === undefined
        ? current.description
        : normalizeText(input.description),
      input.icon === undefined ? current.icon : normalizeText(input.icon),
      input.color === undefined ? current.color : normalizeColor(input.color),
      normalizeText(input.groupName) ?? current.groupName,
      input.sortOrder ?? current.sortOrder,
      new Date().toISOString(),
      input.walletId,
      input.ownerUserId,
    )
    .run();

  if (result.meta.changes !== 1) {
    throw new NotFoundError("Dompet tidak ditemukan.");
  }
  const updated = await getWallet(database, input.walletId);
  if (!updated) throw new NotFoundError("Dompet tidak ditemukan.");
  return updated;
}

export async function setDefaultWallet(
  database: D1Database,
  input: { walletId: string; ownerUserId: string },
): Promise<WalletDetail> {
  const wallet = await getOwnedWallet(
    database,
    input.walletId,
    input.ownerUserId,
  );
  if (wallet.isArchived) {
    throw new ConflictError(
      "Dompet yang diarsipkan tidak bisa dijadikan utama.",
    );
  }

  const now = new Date().toISOString();
  const results = await database.batch([
    database
      .prepare(
        `UPDATE wallets
         SET default_wallet = 0, updated_at = ?1
         WHERE owner_user_id = ?2 AND default_wallet = 1`,
      )
      .bind(now, input.ownerUserId),
    database
      .prepare(
        `UPDATE wallets
         SET default_wallet = 1, updated_at = ?1
         WHERE id = ?2 AND owner_user_id = ?3 AND is_archived = 0`,
      )
      .bind(now, input.walletId, input.ownerUserId),
  ]);

  if (results[1]?.meta.changes !== 1) {
    throw new NotFoundError("Dompet tidak ditemukan.");
  }
  const updated = await getWallet(database, input.walletId);
  if (!updated) throw new NotFoundError("Dompet tidak ditemukan.");
  return updated;
}

export async function archiveWallet(
  database: D1Database,
  input: { walletId: string; ownerUserId: string },
): Promise<WalletDetail> {
  const wallet = await getOwnedWallet(
    database,
    input.walletId,
    input.ownerUserId,
  );
  if (wallet.defaultWallet) {
    throw new ConflictError(
      "Ganti dompet utama sebelum mengarsipkan dompet ini.",
    );
  }

  const now = new Date().toISOString();
  const result = await database
    .prepare(
      `UPDATE wallets
       SET is_archived = 1, archived_at = ?1, updated_at = ?2
       WHERE id = ?3 AND owner_user_id = ?4 AND is_archived = 0`,
    )
    .bind(now, now, input.walletId, input.ownerUserId)
    .run();
  if (result.meta.changes !== 1) {
    throw new ConflictError("Dompet sudah diarsipkan.");
  }

  const updated = await getWallet(database, input.walletId);
  if (!updated) throw new NotFoundError("Dompet tidak ditemukan.");
  return updated;
}

export async function unarchiveWallet(
  database: D1Database,
  input: { walletId: string; ownerUserId: string },
): Promise<WalletDetail> {
  const wallet = await getOwnedWallet(
    database,
    input.walletId,
    input.ownerUserId,
  );
  if (!wallet.isArchived) {
    throw new ConflictError("Dompet tidak sedang diarsipkan.");
  }
  if (
    await activeWalletNameExists(database, {
      ownerUserId: input.ownerUserId,
      normalizedName: normalizeCategoryName(wallet.name),
      exceptId: wallet.id,
    })
  ) {
    throw new ConflictError("Nama dompet sudah digunakan.");
  }

  const result = await database
    .prepare(
      `UPDATE wallets
       SET is_archived = 0, archived_at = NULL, updated_at = ?1
       WHERE id = ?2 AND owner_user_id = ?3 AND is_archived = 1`,
    )
    .bind(new Date().toISOString(), input.walletId, input.ownerUserId)
    .run();
  if (result.meta.changes !== 1) {
    throw new NotFoundError("Dompet tidak ditemukan.");
  }

  const updated = await getWallet(database, input.walletId);
  if (!updated) throw new NotFoundError("Dompet tidak ditemukan.");
  return updated;
}

export async function getWalletBalance(
  database: D1Database,
  walletId: string,
): Promise<number> {
  const row = await database
    .prepare(
      `SELECT ${walletBalanceSql} AS balance FROM wallets w WHERE w.id = ?1`,
    )
    .bind(walletId)
    .first<{ balance: number }>();
  if (!row) throw new NotFoundError("Dompet tidak ditemukan.");
  return row.balance;
}

export async function deleteWallet(
  database: D1Database,
  input: { walletId: string; ownerUserId: string },
): Promise<void> {
  const wallet = await getOwnedWallet(
    database,
    input.walletId,
    input.ownerUserId,
  );
  const related = await database
    .prepare(
      `SELECT COUNT(*) AS total
       FROM (
         SELECT id FROM transactions
         WHERE wallet_id = ?1 OR source_wallet_id = ?1 OR destination_wallet_id = ?1
         UNION ALL
         SELECT id FROM wallet_balance_allocations WHERE wallet_id = ?1
       ) related`,
    )
    .bind(input.walletId)
    .first<{ total: number }>();

  if (wallet.balance !== 0 || (related?.total ?? 0) > 0) {
    throw new ConflictError(
      "Dompet dengan saldo atau riwayat transaksi tidak bisa dihapus.",
    );
  }

  const result = await database
    .prepare(
      `DELETE FROM wallets
       WHERE id = ?1 AND owner_user_id = ?2 AND initial_balance = 0
          AND NOT EXISTS (
            SELECT 1 FROM transactions
            WHERE wallet_id = ?1 OR source_wallet_id = ?1 OR destination_wallet_id = ?1
          )
          AND NOT EXISTS (
            SELECT 1 FROM wallet_balance_allocations WHERE wallet_id = ?1
          )`,
    )
    .bind(input.walletId, input.ownerUserId)
    .run();
  if (result.meta.changes !== 1) {
    throw new ConflictError(
      "Dompet dengan saldo atau riwayat transaksi tidak bisa dihapus.",
    );
  }
}

async function findWalletTransferByKey(
  database: D1Database,
  idempotencyKey: string,
): Promise<WalletTransferRow | null> {
  return database
    .prepare(
      `${walletTransferSelect}
       WHERE t.idempotency_key = ?1 AND t.type = 'wallet_transfer'
       LIMIT 1`,
    )
    .bind(idempotencyKey)
    .first<WalletTransferRow>();
}

async function idempotencyKeyExists(
  database: D1Database,
  idempotencyKey: string,
): Promise<boolean> {
  const row = await database
    .prepare("SELECT id FROM transactions WHERE idempotency_key = ?1 LIMIT 1")
    .bind(idempotencyKey)
    .first<{ id: string }>();
  return Boolean(row);
}

function replayWalletTransfer(
  row: WalletTransferRow | null,
  input: TransferWalletInput,
  description: string | null,
): { transfer: WalletTransferDetail; replayed: true } {
  if (
    !row ||
    row.owner_user_id !== input.actorUserId ||
    row.source_wallet_id !== input.sourceWalletId ||
    row.destination_wallet_id !== input.destinationWalletId ||
    row.amount !== input.amount ||
    row.description !== description ||
    row.transaction_date !== input.transactionDate
  ) {
    throw new IdempotencyConflictError(
      "Idempotency key sudah digunakan dengan payload berbeda.",
    );
  }
  return { transfer: serializeWalletTransfer(row), replayed: true };
}

async function canUseActiveWallet(
  database: D1Database,
  walletId: string,
  ownerUserId: string,
): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT id FROM wallets
       WHERE id = ?1 AND owner_user_id = ?2 AND is_archived = 0
       LIMIT 1`,
    )
    .bind(walletId, ownerUserId)
    .first<{ id: string }>();
  return Boolean(row);
}

export async function transferBetweenWallets(
  database: D1Database,
  input: TransferWalletInput,
): Promise<{ transfer: WalletTransferDetail; replayed: boolean }> {
  if (input.sourceWalletId === input.destinationWalletId) {
    throw new ConflictError("Dompet asal dan tujuan harus berbeda.");
  }

  const description = normalizeText(input.description);
  const existing = await findWalletTransferByKey(
    database,
    input.idempotencyKey,
  );
  if (existing) return replayWalletTransfer(existing, input, description);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const result = await database
    .prepare(
      `INSERT INTO transactions (
         id, owner_user_id, type, source_wallet_id, destination_wallet_id,
         amount, description, transaction_date, source, idempotency_key,
         version, created_at, updated_at
       )
       SELECT ?1, ?2, 'wallet_transfer', ?3, ?4, ?5, ?6, ?7, 'web', ?8, 1, ?9, ?10
       WHERE EXISTS (
         SELECT 1 FROM wallets w
         WHERE w.id = ?3 AND w.owner_user_id = ?2 AND w.is_archived = 0
           AND ${walletBalanceSql} >= ?5
       )
       AND EXISTS (
         SELECT 1 FROM wallets
         WHERE id = ?4 AND owner_user_id = ?2 AND is_archived = 0
       )
       ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .bind(
      id,
      input.actorUserId,
      input.sourceWalletId,
      input.destinationWalletId,
      input.amount,
      description,
      input.transactionDate,
      input.idempotencyKey,
      now,
      now,
    )
    .run();

  if (result.meta.changes !== 1) {
    const raced = await findWalletTransferByKey(database, input.idempotencyKey);
    if (raced) return replayWalletTransfer(raced, input, description);
    if (await idempotencyKeyExists(database, input.idempotencyKey)) {
      throw new IdempotencyConflictError(
        "Idempotency key sudah digunakan dengan payload berbeda.",
      );
    }

    for (const walletId of [input.sourceWalletId, input.destinationWalletId]) {
      if (!(await canUseActiveWallet(database, walletId, input.actorUserId))) {
        throw new NotFoundError("Dompet tidak ditemukan.");
      }
    }
    throw new InsufficientBalanceError("Saldo dompet tidak mencukupi.");
  }

  const transfer = await findWalletTransferByKey(
    database,
    input.idempotencyKey,
  );
  if (!transfer) {
    throw new NotFoundError("Transfer dompet tidak ditemukan setelah dibuat.");
  }
  return { transfer: serializeWalletTransfer(transfer), replayed: false };
}
