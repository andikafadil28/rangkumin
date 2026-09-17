import {
  IdempotencyConflictError,
  InvalidCategoryError,
  NotFoundError,
  VersionConflictError,
} from "./errors";

export type TransactionType =
  | "income"
  | "expense"
  | "saving_deposit"
  | "saving_withdrawal"
  | "saving_transfer"
  | "wallet_transfer";

export type ReconciliationStatus = "unreconciled" | "reconciled" | "excluded";

export type TransactionRow = {
  id: string;
  owner_user_id: string;
  type: TransactionType;
  category_id: string | null;
  source_savings_goal_id: string | null;
  destination_savings_goal_id: string | null;
  wallet_id: string | null;
  source_wallet_id: string | null;
  destination_wallet_id: string | null;
  reconciliation_status: ReconciliationStatus;
  amount: number;
  description: string | null;
  transaction_date: string;
  source: "web" | "telegram" | "import";
  idempotency_key: string;
  version: number;
  deleted_at: string | null;
  purge_after: string | null;
  created_at: string;
  updated_at: string;
  category_name?: string | null;
  category_type?: string | null;
  wallet_name?: string | null;
  wallet_type?: string | null;
  wallet_icon?: string | null;
  wallet_color?: string | null;
  source_wallet_name?: string | null;
  destination_wallet_name?: string | null;
};

export type TransactionDetail = {
  id: string;
  ownerUserId: string;
  type: TransactionType;
  amount: number;
  categoryId: string | null;
  walletId: string | null;
  wallet: {
    id: string;
    name: string;
    type: string;
    icon: string | null;
    color: string | null;
  } | null;
  sourceWallet: { id: string; name: string } | null;
  destinationWallet: { id: string; name: string } | null;
  reconciliationStatus: ReconciliationStatus;
  description: string | null;
  transactionDate: string;
  source: "web" | "telegram" | "import";
  version: number;
  deletedAt: string | null;
  purgeAfter: string | null;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string; type: string } | null;
};

export type CreateTransactionInput = {
  ownerUserId: string;
  type: "income" | "expense";
  amount: number;
  transactionDate: string;
  categoryId: string;
  description: string | null;
  source: "web" | "telegram";
  idempotencyKey: string;
  walletId?: string | null;
};

export type UpdateTransactionPatch = {
  type?: "income" | "expense";
  amount?: number;
  transactionDate?: string;
  categoryId?: string;
  description?: string | null;
  walletId?: string | null;
  reconciliationStatus?: ReconciliationStatus;
};

export type UpdateTransactionInput = {
  id: string;
  ownerUserId: string;
  version: number;
  patch: UpdateTransactionPatch;
};

export type ListTransactionsFilter = {
  ownerUserId?: string;
  type?: TransactionType;
  categoryId?: string;
  walletId?: string;
  reconciliationStatus?: ReconciliationStatus;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
  status?: "active" | "trashed" | "all";
  limit: number;
  offset: number;
};

const transactionSortSql = {
  date_desc: "t.transaction_date DESC, t.created_at DESC, t.id DESC",
  date_asc: "t.transaction_date ASC, t.created_at ASC, t.id ASC",
  amount_desc:
    "t.amount DESC, t.transaction_date DESC, t.created_at DESC, t.id DESC",
  amount_asc:
    "t.amount ASC, t.transaction_date DESC, t.created_at DESC, t.id DESC",
} as const;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export type SummaryFilter = {
  ownerUserId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export async function notifyTransactionCreated(
  database: D1Database,
  transaction: TransactionDetail,
  actorDisplayName: string,
): Promise<void> {
  if (transaction.type !== "income" && transaction.type !== "expense") return;

  const partner = await database
    .prepare(
      `SELECT id FROM users WHERE is_active = 1 AND id <> ?1 ORDER BY id LIMIT 1`,
    )
    .bind(transaction.ownerUserId)
    .first<{ id: string }>();

  if (!partner) return;

  const typeLabel = transaction.type === "income" ? "pemasukan" : "pengeluaran";
  const title = `${actorDisplayName} mencatat ${typeLabel}`;
  const amount = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(transaction.amount);
  const body = `Rp${amount}${transaction.description ? ` — ${transaction.description}` : ""}`;

  const now = new Date().toISOString();
  await database
    .prepare(
      `INSERT INTO notifications (
         id, recipient_user_id, kind, channel, transaction_id,
         title, body, dedupe_key, scheduled_for
       ) VALUES (?, ?, 'transaction', 'dashboard', ?, ?, ?, ?, ?)
       ON CONFLICT(dedupe_key) DO NOTHING`,
    )
    .bind(
      crypto.randomUUID(),
      partner.id,
      transaction.id,
      title.slice(0, 160),
      body.slice(0, 1000),
      `transaction:${transaction.id}:${partner.id}`,
      now,
    )
    .run();
}

export type SummaryItem = {
  userId: string;
  displayName: string;
  income: number;
  incomeCount: number;
  expense: number;
  expenseCount: number;
  net: number;
};

export type TransactionSummary = {
  byUser: SummaryItem[];
  combined: {
    income: number;
    incomeCount: number;
    expense: number;
    expenseCount: number;
    net: number;
    categories: Array<{
      categoryId: string;
      name: string;
      type: string;
      total: number;
      count: number;
    }>;
  };
};

export type TransactionSummaryTotals = {
  income: number;
  incomeCount: number;
  expense: number;
  expenseCount: number;
  net: number;
};

type TypeTotalRow = {
  owner_user_id: string;
  type: "income" | "expense";
  total: number;
  count: number;
};

type CategoryTotalRow = {
  id: string;
  name: string;
  type: string;
  total: number;
  count: number;
};

type IdempotencyRow = {
  id: string;
  owner_user_id: string;
  type: string;
  amount: number;
  category_id: string;
  transaction_date: string;
  description: string | null;
  wallet_id: string | null;
};

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeDescription(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function serializeTransaction(row: TransactionRow): TransactionDetail {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    type: row.type,
    amount: row.amount,
    categoryId: row.category_id,
    walletId: row.wallet_id,
    wallet: row.wallet_id
      ? {
          id: row.wallet_id,
          name: row.wallet_name ?? "Dompet",
          type: row.wallet_type ?? "other",
          icon: row.wallet_icon ?? null,
          color: row.wallet_color ?? null,
        }
      : null,
    sourceWallet: row.source_wallet_id
      ? {
          id: row.source_wallet_id,
          name: row.source_wallet_name ?? "Dompet",
        }
      : null,
    destinationWallet: row.destination_wallet_id
      ? {
          id: row.destination_wallet_id,
          name: row.destination_wallet_name ?? "Dompet",
        }
      : null,
    reconciliationStatus: row.reconciliation_status,
    description: row.description,
    transactionDate: row.transaction_date,
    source: row.source,
    version: row.version,
    deletedAt: row.deleted_at,
    purgeAfter: row.purge_after,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: row.category_id
      ? {
          id: row.category_id,
          name: row.category_name ?? "Kategori",
          type: row.category_type ?? row.type,
        }
      : null,
  };
}

const transactionSelect = `SELECT
  t.id, t.owner_user_id, t.type, t.category_id,
  t.source_savings_goal_id, t.destination_savings_goal_id,
  t.wallet_id, t.source_wallet_id, t.destination_wallet_id,
  t.reconciliation_status,
  t.amount, t.description, t.transaction_date, t.source,
  t.idempotency_key, t.version, t.deleted_at, t.purge_after,
  t.created_at, t.updated_at,
  c.name AS category_name, c.type AS category_type,
  wallet.name AS wallet_name, wallet.type AS wallet_type,
  wallet.icon AS wallet_icon, wallet.color AS wallet_color,
  source_wallet.name AS source_wallet_name,
  destination_wallet.name AS destination_wallet_name
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id
LEFT JOIN wallets wallet ON wallet.id = t.wallet_id
LEFT JOIN wallets source_wallet ON source_wallet.id = t.source_wallet_id
LEFT JOIN wallets destination_wallet ON destination_wallet.id = t.destination_wallet_id`;

async function getTransactionRow(
  database: D1Database,
  transactionId: string,
): Promise<TransactionRow | null> {
  return database
    .prepare(`${transactionSelect} WHERE t.id = ?1 LIMIT 1`)
    .bind(transactionId)
    .first<TransactionRow>();
}

export async function getTransaction(
  database: D1Database,
  transactionId: string,
): Promise<TransactionDetail | null> {
  const row = await getTransactionRow(database, transactionId);
  return row ? serializeTransaction(row) : null;
}

async function validateTransactionCategory(
  database: D1Database,
  input: { type: string; categoryId: string; ownerUserId: string },
): Promise<void> {
  const category = await database
    .prepare(
      `SELECT id
       FROM categories
       WHERE id = ?1
         AND type = ?2
         AND is_active = 1
         AND (owner_user_id = ?3 OR is_default = 1)
       LIMIT 1`,
    )
    .bind(input.categoryId, input.type, input.ownerUserId)
    .first<{ id: string }>();

  if (!category) {
    throw new InvalidCategoryError(
      "Kategori tidak valid untuk jenis transaksi ini.",
    );
  }
}

async function validateTransactionWallet(
  database: D1Database,
  input: { walletId: string | null | undefined; ownerUserId: string },
): Promise<void> {
  if (!input.walletId) return;
  const wallet = await database
    .prepare(
      `SELECT id FROM wallets
       WHERE id = ?1 AND owner_user_id = ?2 AND is_archived = 0
       LIMIT 1`,
    )
    .bind(input.walletId, input.ownerUserId)
    .first<{ id: string }>();
  if (!wallet) throw new NotFoundError("Dompet tidak ditemukan.");
}

async function findByIdempotencyKey(
  database: D1Database,
  key: string,
): Promise<IdempotencyRow | null> {
  return database
    .prepare(
      `SELECT id, owner_user_id, type, amount, category_id, wallet_id,
         transaction_date, description
       FROM transactions
       WHERE idempotency_key = ?1
       LIMIT 1`,
    )
    .bind(key)
    .first<IdempotencyRow>();
}

function matchesIdempotentPayload(
  existing: IdempotencyRow,
  input: CreateTransactionInput,
  description: string | null,
): boolean {
  return (
    existing.owner_user_id === input.ownerUserId &&
    existing.type === input.type &&
    existing.amount === input.amount &&
    existing.category_id === input.categoryId &&
    (existing.wallet_id ?? null) === (input.walletId ?? null) &&
    existing.transaction_date === input.transactionDate &&
    (existing.description ?? null) === description
  );
}

async function replayTransaction(
  database: D1Database,
  existing: IdempotencyRow | null,
  input: CreateTransactionInput,
  description: string | null,
): Promise<{ transaction: TransactionDetail; replayed: true }> {
  if (!existing || !matchesIdempotentPayload(existing, input, description)) {
    throw new IdempotencyConflictError(
      "Idempotency key sudah digunakan dengan payload berbeda.",
    );
  }

  const transaction = await getTransaction(database, existing.id);
  if (!transaction) {
    throw new NotFoundError("Transaksi tidak ditemukan.");
  }

  return { transaction, replayed: true };
}

export async function createTransaction(
  database: D1Database,
  input: CreateTransactionInput,
): Promise<{ transaction: TransactionDetail; replayed: boolean }> {
  const description = normalizeDescription(input.description);

  const existing = await findByIdempotencyKey(database, input.idempotencyKey);

  if (existing) {
    return replayTransaction(database, existing, input, description);
  }

  await validateTransactionCategory(database, {
    type: input.type,
    categoryId: input.categoryId,
    ownerUserId: input.ownerUserId,
  });
  await validateTransactionWallet(database, {
    walletId: input.walletId,
    ownerUserId: input.ownerUserId,
  });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const result = await database
    .prepare(
      `INSERT INTO transactions (
          id, owner_user_id, type, category_id, wallet_id, amount, description,
          transaction_date, source, idempotency_key, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .bind(
      id,
      input.ownerUserId,
      input.type,
      input.categoryId,
      input.walletId ?? null,
      input.amount,
      description,
      input.transactionDate,
      input.source,
      input.idempotencyKey,
      now,
      now,
    )
    .run();

  if (result.meta.changes !== 1) {
    const raced = await findByIdempotencyKey(database, input.idempotencyKey);
    return replayTransaction(database, raced, input, description);
  }

  const transaction = await getTransaction(database, id);
  if (!transaction) {
    throw new NotFoundError("Transaksi tidak ditemukan setelah dibuat.");
  }

  return { transaction, replayed: false };
}

export async function updateTransaction(
  database: D1Database,
  input: UpdateTransactionInput,
): Promise<TransactionDetail> {
  const current = await getTransaction(database, input.id);
  if (!current) {
    throw new NotFoundError("Transaksi tidak ditemukan.");
  }

  if (current.version !== input.version) {
    throw new VersionConflictError(
      "Transaksi sudah diubah pihak lain; muat ulang lalu coba lagi.",
    );
  }

  if (current.deletedAt) {
    throw new NotFoundError("Transaksi tidak ditemukan.");
  }

  const nextType = input.patch.type ?? current.type;
  const nextCategoryId = input.patch.categoryId ?? current.categoryId;
  const nextWalletId =
    input.patch.walletId === undefined
      ? current.walletId
      : input.patch.walletId;
  const description = normalizeDescription(
    input.patch.description ?? current.description,
  );

  if (!nextCategoryId) {
    throw new InvalidCategoryError(
      "Kategori tidak valid untuk jenis transaksi ini.",
    );
  }

  if (nextType !== current.type || nextCategoryId !== current.categoryId) {
    await validateTransactionCategory(database, {
      type: nextType,
      categoryId: nextCategoryId,
      ownerUserId: input.ownerUserId,
    });
  }
  if (nextWalletId !== current.walletId) {
    await validateTransactionWallet(database, {
      walletId: nextWalletId,
      ownerUserId: input.ownerUserId,
    });
  }

  const result = await database
    .prepare(
      `UPDATE transactions
       SET type = ?1,
           category_id = ?2,
           amount = ?3,
           description = ?4,
            transaction_date = ?5,
            wallet_id = ?6,
            reconciliation_status = ?7,
            version = version + 1,
            updated_at = ?8
        WHERE id = ?9
          AND version = ?10
         AND type IN ('income', 'expense')`,
    )
    .bind(
      nextType,
      nextCategoryId,
      input.patch.amount ?? current.amount,
      description,
      input.patch.transactionDate ?? current.transactionDate,
      nextWalletId,
      input.patch.reconciliationStatus ?? current.reconciliationStatus,
      new Date().toISOString(),
      input.id,
      input.version,
    )
    .run();

  if (result.meta.changes !== 1) {
    throw new VersionConflictError(
      "Transaksi sudah diubah pihak lain; muat ulang lalu coba lagi.",
    );
  }

  const updated = await getTransaction(database, input.id);
  if (!updated) {
    throw new NotFoundError("Transaksi tidak ditemukan.");
  }

  return updated;
}

export async function softDeleteTransaction(
  database: D1Database,
  transactionId: string,
): Promise<void> {
  const now = new Date();
  const result = await database
    .prepare(
      `UPDATE transactions
       SET deleted_at = ?1,
           purge_after = ?2,
           updated_at = ?1
       WHERE id = ?3
         AND deleted_at IS NULL
         AND type IN ('income', 'expense')`,
    )
    .bind(
      now.toISOString(),
      new Date(now.getTime() + TRASH_RETENTION_MS).toISOString(),
      transactionId,
    )
    .run();

  if (result.meta.changes !== 1) {
    throw new NotFoundError("Transaksi tidak ditemukan.");
  }
}

export async function restoreTransaction(
  database: D1Database,
  transactionId: string,
): Promise<TransactionDetail> {
  const result = await database
    .prepare(
      `UPDATE transactions
       SET deleted_at = NULL,
           purge_after = NULL,
           updated_at = ?1
       WHERE id = ?2
         AND deleted_at IS NOT NULL
         AND type IN ('income', 'expense')`,
    )
    .bind(new Date().toISOString(), transactionId)
    .run();

  if (result.meta.changes !== 1) {
    throw new NotFoundError("Transaksi tidak ditemukan.");
  }

  const transaction = await getTransaction(database, transactionId);
  if (!transaction) {
    throw new NotFoundError("Transaksi tidak ditemukan.");
  }

  return transaction;
}

export async function purgeTransaction(
  database: D1Database,
  transactionId: string,
): Promise<void> {
  const result = await database
    .prepare(
      `DELETE FROM transactions
       WHERE id = ?1
         AND deleted_at IS NOT NULL
         AND type IN ('income', 'expense')`,
    )
    .bind(transactionId)
    .run();

  if (result.meta.changes !== 1) {
    throw new NotFoundError("Transaksi tidak ditemukan.");
  }
}

export async function listTransactions(
  database: D1Database,
  filters: ListTransactionsFilter,
): Promise<{
  items: TransactionDetail[];
  total: number;
  limit: number;
  offset: number;
}> {
  const conditions: string[] = [];
  const parameters: Array<string | number> = [];

  if (filters.status === "active") {
    conditions.push("t.deleted_at IS NULL");
  } else if (filters.status === "trashed") {
    conditions.push("t.deleted_at IS NOT NULL");
  }

  if (filters.ownerUserId) {
    conditions.push("t.owner_user_id = ?" + (parameters.length + 1));
    parameters.push(filters.ownerUserId);
  }
  if (filters.type) {
    conditions.push("t.type = ?" + (parameters.length + 1));
    parameters.push(filters.type);
  }
  if (filters.categoryId) {
    conditions.push("t.category_id = ?" + (parameters.length + 1));
    parameters.push(filters.categoryId);
  }
  if (filters.walletId) {
    const placeholder = "?" + (parameters.length + 1);
    conditions.push(
      `(t.wallet_id = ${placeholder} OR t.source_wallet_id = ${placeholder} OR t.destination_wallet_id = ${placeholder})`,
    );
    parameters.push(filters.walletId);
  }
  if (filters.reconciliationStatus) {
    conditions.push("t.reconciliation_status = ?" + (parameters.length + 1));
    parameters.push(filters.reconciliationStatus);
  }
  if (filters.dateFrom) {
    conditions.push("t.transaction_date >= ?" + (parameters.length + 1));
    parameters.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push("t.transaction_date <= ?" + (parameters.length + 1));
    parameters.push(filters.dateTo);
  }
  if (filters.search) {
    conditions.push(
      "COALESCE(t.description, '') LIKE ?" +
        (parameters.length + 1) +
        " ESCAPE '\\'",
    );
    parameters.push(`%${escapeLike(filters.search)}%`);
  }
  if (filters.minAmount !== undefined) {
    conditions.push("t.amount >= ?" + (parameters.length + 1));
    parameters.push(filters.minAmount);
  }
  if (filters.maxAmount !== undefined) {
    conditions.push("t.amount <= ?" + (parameters.length + 1));
    parameters.push(filters.maxAmount);
  }

  const whereSql = conditions.length
    ? ` WHERE ${conditions.join(" AND ")}`
    : "";
  const orderBy = transactionSortSql[filters.sort ?? "date_desc"];

  const countRow = await database
    .prepare(`SELECT COUNT(*) AS total FROM transactions t${whereSql}`)
    .bind(...parameters)
    .first<{ total: number }>();

  const { results } = await database
    .prepare(
      `${transactionSelect}${whereSql}
       ORDER BY ${orderBy}
       LIMIT ?${parameters.length + 1} OFFSET ?${parameters.length + 2}`,
    )
    .bind(...parameters, filters.limit, filters.offset)
    .all<TransactionRow>();

  return {
    items: results.map(serializeTransaction),
    total: countRow?.total ?? 0,
    limit: filters.limit,
    offset: filters.offset,
  };
}

export async function summarizeTransactions(
  database: D1Database,
  filters: SummaryFilter = {},
): Promise<TransactionSummary> {
  const conditions: string[] = ["t.deleted_at IS NULL"];
  const parameters: Array<string | number> = [];

  if (filters.ownerUserId) {
    conditions.push("t.owner_user_id = ?" + (parameters.length + 1));
    parameters.push(filters.ownerUserId);
  }
  if (filters.dateFrom) {
    conditions.push("t.transaction_date >= ?" + (parameters.length + 1));
    parameters.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push("t.transaction_date <= ?" + (parameters.length + 1));
    parameters.push(filters.dateTo);
  }

  const whereSql = ` WHERE ${conditions.join(" AND ")}`;

  const { results: totals } = await database
    .prepare(
      `SELECT t.owner_user_id, t.type, SUM(t.amount) AS total, COUNT(*) AS count
       FROM transactions t${whereSql}
         AND t.type IN ('income', 'expense')
       GROUP BY t.owner_user_id, t.type`,
    )
    .bind(...parameters)
    .all<TypeTotalRow>();

  const { results: categories } = await database
    .prepare(
      `SELECT c.id, c.name, c.type, SUM(t.amount) AS total, COUNT(*) AS count
       FROM transactions t
       JOIN categories c ON c.id = t.category_id${whereSql}
         AND t.type = 'expense'
       GROUP BY c.id
       ORDER BY total DESC`,
    )
    .bind(...parameters)
    .all<CategoryTotalRow>();

  const usersQuery = filters.ownerUserId
    ? database
        .prepare(
          `SELECT id, display_name FROM users
           WHERE is_active = 1 AND id = ?1 ORDER BY id`,
        )
        .bind(filters.ownerUserId)
    : database.prepare(
        `SELECT id, display_name FROM users WHERE is_active = 1 ORDER BY id`,
      );
  const { results: users } = await usersQuery.all<{
    id: string;
    display_name: string;
  }>();

  const totalsByType = (userId: string, type: "income" | "expense") =>
    totals.find((row) => row.owner_user_id === userId && row.type === type);

  const byUser: SummaryItem[] = users.map((user) => {
    const income = totalsByType(user.id, "income");
    const expense = totalsByType(user.id, "expense");
    const incomeTotal = income?.total ?? 0;
    const expenseTotal = expense?.total ?? 0;

    return {
      userId: user.id,
      displayName: user.display_name,
      income: incomeTotal,
      incomeCount: income?.count ?? 0,
      expense: expenseTotal,
      expenseCount: expense?.count ?? 0,
      net: incomeTotal - expenseTotal,
    };
  });

  const combinedIncome = byUser.reduce((sum, item) => sum + item.income, 0);
  const combinedIncomeCount = byUser.reduce(
    (sum, item) => sum + item.incomeCount,
    0,
  );
  const combinedExpense = byUser.reduce((sum, item) => sum + item.expense, 0);
  const combinedExpenseCount = byUser.reduce(
    (sum, item) => sum + item.expenseCount,
    0,
  );

  return {
    byUser,
    combined: {
      income: combinedIncome,
      incomeCount: combinedIncomeCount,
      expense: combinedExpense,
      expenseCount: combinedExpenseCount,
      net: combinedIncome - combinedExpense,
      categories: categories.map((row) => ({
        categoryId: row.id,
        name: row.name,
        type: row.type,
        total: row.total,
        count: row.count,
      })),
    },
  };
}

export async function summarizeTransactionTotals(
  database: D1Database,
  filters: SummaryFilter = {},
): Promise<TransactionSummaryTotals> {
  const conditions = [
    "t.deleted_at IS NULL",
    "t.type IN ('income', 'expense')",
  ];
  const parameters: string[] = [];

  if (filters.ownerUserId) {
    conditions.push("t.owner_user_id = ?" + (parameters.length + 1));
    parameters.push(filters.ownerUserId);
  }
  if (filters.dateFrom) {
    conditions.push("t.transaction_date >= ?" + (parameters.length + 1));
    parameters.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push("t.transaction_date <= ?" + (parameters.length + 1));
    parameters.push(filters.dateTo);
  }

  const row = await database
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS income,
         SUM(CASE WHEN t.type = 'income' THEN 1 ELSE 0 END) AS income_count,
         COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS expense,
         SUM(CASE WHEN t.type = 'expense' THEN 1 ELSE 0 END) AS expense_count
       FROM transactions t
       WHERE ${conditions.join(" AND ")}`,
    )
    .bind(...parameters)
    .first<{
      income: number;
      income_count: number;
      expense: number;
      expense_count: number;
    }>();

  const income = row?.income ?? 0;
  const expense = row?.expense ?? 0;
  return {
    income,
    incomeCount: row?.income_count ?? 0,
    expense,
    expenseCount: row?.expense_count ?? 0,
    net: income - expense,
  };
}
