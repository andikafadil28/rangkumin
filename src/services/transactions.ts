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
  | "saving_transfer";

export type TransactionRow = {
  id: string;
  owner_user_id: string;
  type: TransactionType;
  category_id: string | null;
  source_savings_goal_id: string | null;
  destination_savings_goal_id: string | null;
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
};

export type TransactionDetail = {
  id: string;
  ownerUserId: string;
  type: TransactionType;
  amount: number;
  categoryId: string | null;
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
  source: "web";
  idempotencyKey: string;
};

export type UpdateTransactionPatch = {
  type?: "income" | "expense";
  amount?: number;
  transactionDate?: string;
  categoryId?: string;
  description?: string | null;
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
  dateFrom?: string;
  dateTo?: string;
  status?: "active" | "trashed" | "all";
  limit: number;
  offset: number;
};

export type SummaryFilter = {
  ownerUserId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type SummaryItem = {
  userId: string;
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
  t.amount, t.description, t.transaction_date, t.source,
  t.idempotency_key, t.version, t.deleted_at, t.purge_after,
  t.created_at, t.updated_at,
  c.name AS category_name, c.type AS category_type
FROM transactions t
LEFT JOIN categories c ON c.id = t.category_id`;

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

async function findByIdempotencyKey(
  database: D1Database,
  key: string,
): Promise<IdempotencyRow | null> {
  return database
    .prepare(
      `SELECT id, owner_user_id, type, amount, category_id, transaction_date, description
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

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const result = await database
    .prepare(
      `INSERT INTO transactions (
         id, owner_user_id, type, category_id, amount, description,
         transaction_date, source, idempotency_key, version, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .bind(
      id,
      input.ownerUserId,
      input.type,
      input.categoryId,
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

  const result = await database
    .prepare(
      `UPDATE transactions
       SET type = ?1,
           category_id = ?2,
           amount = ?3,
           description = ?4,
           transaction_date = ?5,
           version = version + 1,
           updated_at = ?6
       WHERE id = ?7
         AND version = ?8
         AND type IN ('income', 'expense')`,
    )
    .bind(
      nextType,
      nextCategoryId,
      input.patch.amount ?? current.amount,
      description,
      input.patch.transactionDate ?? current.transactionDate,
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
  if (filters.dateFrom) {
    conditions.push("t.transaction_date >= ?" + (parameters.length + 1));
    parameters.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push("t.transaction_date <= ?" + (parameters.length + 1));
    parameters.push(filters.dateTo);
  }

  const whereSql = conditions.length
    ? ` WHERE ${conditions.join(" AND ")}`
    : "";

  const countRow = await database
    .prepare(`SELECT COUNT(*) AS total FROM transactions t${whereSql}`)
    .bind(...parameters)
    .first<{ total: number }>();

  const { results } = await database
    .prepare(
      `${transactionSelect}${whereSql}
       ORDER BY t.transaction_date DESC, t.created_at DESC
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
         AND t.type IN ('income', 'expense')
       GROUP BY c.id
       ORDER BY total DESC`,
    )
    .bind(...parameters)
    .all<CategoryTotalRow>();

  const users = filters.ownerUserId
    ? [{ id: filters.ownerUserId }]
    : (
        await database
          .prepare(`SELECT id FROM users WHERE is_active = 1 ORDER BY id`)
          .all<{ id: string }>()
      ).results;

  const totalsByType = (userId: string, type: "income" | "expense") =>
    totals.find((row) => row.owner_user_id === userId && row.type === type);

  const byUser: SummaryItem[] = users.map((user) => {
    const income = totalsByType(user.id, "income");
    const expense = totalsByType(user.id, "expense");
    const incomeTotal = income?.total ?? 0;
    const expenseTotal = expense?.total ?? 0;

    return {
      userId: user.id,
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
