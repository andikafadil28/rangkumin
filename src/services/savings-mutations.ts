import {
  IdempotencyConflictError,
  InsufficientBalanceError,
  NotFoundError,
} from "./errors";

export type SavingsMutationType =
  "saving_deposit" | "saving_withdrawal" | "saving_transfer";

type SavingsMutationRow = {
  id: string;
  owner_user_id: string;
  type: SavingsMutationType;
  source_savings_goal_id: string | null;
  destination_savings_goal_id: string | null;
  wallet_id: string | null;
  amount: number;
  description: string | null;
  transaction_date: string;
  source: "web" | "telegram" | "import";
  idempotency_key: string;
  created_at: string;
  source_goal_name: string | null;
  destination_goal_name: string | null;
  wallet_name: string | null;
};

export type SavingsMutationDetail = {
  id: string;
  actorUserId: string;
  type: SavingsMutationType;
  sourceGoal: { id: string; name: string } | null;
  destinationGoal: { id: string; name: string } | null;
  wallet: { id: string; name: string } | null;
  amount: number;
  description: string | null;
  transactionDate: string;
  source: "web" | "telegram" | "import";
  createdAt: string;
};

type CreateSavingsMutationInput = {
  actorUserId: string;
  type: SavingsMutationType;
  sourceGoalId: string | null;
  destinationGoalId: string | null;
  walletId: string | null;
  amount: number;
  description: string | null;
  transactionDate: string;
  idempotencyKey: string;
};

const mutationSelect = `SELECT
  t.id, t.owner_user_id, t.type,
  t.source_savings_goal_id, t.destination_savings_goal_id, t.wallet_id,
  t.amount, t.description, t.transaction_date, t.source,
  t.idempotency_key, t.created_at,
  source_goal.name AS source_goal_name,
  destination_goal.name AS destination_goal_name,
  wallet.name AS wallet_name
FROM transactions t
LEFT JOIN savings_goals source_goal ON source_goal.id = t.source_savings_goal_id
LEFT JOIN savings_goals destination_goal
  ON destination_goal.id = t.destination_savings_goal_id
LEFT JOIN wallets wallet ON wallet.id = t.wallet_id`;

function serializeMutation(row: SavingsMutationRow): SavingsMutationDetail {
  return {
    id: row.id,
    actorUserId: row.owner_user_id,
    type: row.type,
    sourceGoal: row.source_savings_goal_id
      ? { id: row.source_savings_goal_id, name: row.source_goal_name ?? "Pos" }
      : null,
    destinationGoal: row.destination_savings_goal_id
      ? {
          id: row.destination_savings_goal_id,
          name: row.destination_goal_name ?? "Pos",
        }
      : null,
    wallet: row.wallet_id
      ? { id: row.wallet_id, name: row.wallet_name ?? "Dompet" }
      : null,
    amount: row.amount,
    description: row.description,
    transactionDate: row.transaction_date,
    source: row.source,
    createdAt: row.created_at,
  };
}

function normalizeDescription(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function findMutationByKey(
  database: D1Database,
  key: string,
): Promise<SavingsMutationRow | null> {
  return database
    .prepare(
      `${mutationSelect}
       WHERE t.idempotency_key = ?1
         AND t.type IN ('saving_deposit', 'saving_withdrawal', 'saving_transfer')
       LIMIT 1`,
    )
    .bind(key)
    .first<SavingsMutationRow>();
}

function matchesPayload(
  row: SavingsMutationRow,
  input: CreateSavingsMutationInput,
  description: string | null,
): boolean {
  return (
    row.owner_user_id === input.actorUserId &&
    row.type === input.type &&
    row.source_savings_goal_id === input.sourceGoalId &&
    row.destination_savings_goal_id === input.destinationGoalId &&
    (row.wallet_id ?? null) === input.walletId &&
    row.amount === input.amount &&
    row.description === description &&
    row.transaction_date === input.transactionDate
  );
}

function replayMutation(
  row: SavingsMutationRow | null,
  input: CreateSavingsMutationInput,
  description: string | null,
): { mutation: SavingsMutationDetail; replayed: true } {
  if (!row || !matchesPayload(row, input, description)) {
    throw new IdempotencyConflictError(
      "Idempotency key sudah digunakan dengan payload berbeda.",
    );
  }

  return { mutation: serializeMutation(row), replayed: true };
}

async function canMutateGoal(
  database: D1Database,
  goalId: string,
  actorUserId: string,
): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT id
       FROM savings_goals
       WHERE id = ?1
         AND archived_at IS NULL
         AND (ownership_scope = 'shared' OR owner_user_id = ?2)
       LIMIT 1`,
    )
    .bind(goalId, actorUserId)
    .first<{ id: string }>();

  return Boolean(row);
}

async function canUseWallet(
  database: D1Database,
  walletId: string,
  actorUserId: string,
): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT id FROM wallets
       WHERE id = ?1 AND owner_user_id = ?2 AND is_archived = 0
       LIMIT 1`,
    )
    .bind(walletId, actorUserId)
    .first<{ id: string }>();
  return Boolean(row);
}

export async function getSavingsGoalBalance(
  database: D1Database,
  goalId: string,
): Promise<number> {
  const row = await database
    .prepare(
      `SELECT COALESCE(SUM(CASE
         WHEN type IN ('saving_deposit', 'saving_transfer')
           AND destination_savings_goal_id = ?1 THEN amount
         WHEN type IN ('saving_withdrawal', 'saving_transfer')
           AND source_savings_goal_id = ?1 THEN -amount
         ELSE 0
       END), 0) AS balance
       FROM transactions
       WHERE deleted_at IS NULL
         AND (
           source_savings_goal_id = ?1
           OR destination_savings_goal_id = ?1
         )`,
    )
    .bind(goalId)
    .first<{ balance: number }>();

  return row?.balance ?? 0;
}

export async function getCashBalances(database: D1Database): Promise<
  Array<{
    userId: string;
    balance: number;
  }>
> {
  const { results } = await database
    .prepare(
      `SELECT u.id AS user_id, COALESCE(SUM(CASE
         WHEN t.type = 'income' THEN t.amount
         WHEN t.type = 'expense' THEN -t.amount
         WHEN t.type = 'saving_deposit' THEN -t.amount
         WHEN t.type = 'saving_withdrawal' THEN t.amount
         ELSE 0
       END), 0) AS balance
       FROM users u
       LEFT JOIN transactions t
         ON t.owner_user_id = u.id AND t.deleted_at IS NULL
       WHERE u.is_active = 1
       GROUP BY u.id
       ORDER BY u.id`,
    )
    .all<{ user_id: string; balance: number }>();

  return results.map((row) => ({ userId: row.user_id, balance: row.balance }));
}

function atomicCondition(type: SavingsMutationType): string {
  const goalAccess = (goal: string) => `EXISTS (
    SELECT 1 FROM savings_goals
    WHERE id = ${goal}
      AND archived_at IS NULL
      AND (ownership_scope = 'shared' OR owner_user_id = ?2)
  )`;
  const goalBalance = `COALESCE((
    SELECT SUM(CASE
      WHEN type IN ('saving_deposit', 'saving_transfer')
        AND destination_savings_goal_id = ?4 THEN amount
      WHEN type IN ('saving_withdrawal', 'saving_transfer')
        AND source_savings_goal_id = ?4 THEN -amount
      ELSE 0
    END)
    FROM transactions
    WHERE deleted_at IS NULL
      AND (source_savings_goal_id = ?4 OR destination_savings_goal_id = ?4)
  ), 0) >= ?7`;
  const walletAccess = `(?6 IS NULL OR EXISTS (
    SELECT 1 FROM wallets
    WHERE id = ?6 AND owner_user_id = ?2 AND is_archived = 0
  ))`;
  const walletBalance = `EXISTS (
    SELECT 1 FROM wallets w
    WHERE w.id = ?6
      AND w.owner_user_id = ?2
      AND w.is_archived = 0
      AND w.initial_balance + COALESCE((
        SELECT SUM(CASE
          WHEN t.type = 'income' AND t.wallet_id = w.id THEN t.amount
          WHEN t.type IN ('expense', 'saving_deposit') AND t.wallet_id = w.id THEN -t.amount
          WHEN t.type = 'saving_withdrawal' AND t.wallet_id = w.id THEN t.amount
          WHEN t.type = 'wallet_transfer' AND t.source_wallet_id = w.id THEN -t.amount
          WHEN t.type = 'wallet_transfer' AND t.destination_wallet_id = w.id THEN t.amount
          ELSE 0
        END)
        FROM transactions t
        WHERE t.deleted_at IS NULL
          AND (
            t.wallet_id = w.id
            OR t.source_wallet_id = w.id
            OR t.destination_wallet_id = w.id
          )
      ), 0) >= ?7
  )`;

  if (type === "saving_deposit") {
    return `${goalAccess("?5")} AND (
      (?6 IS NOT NULL AND ${walletBalance})
      OR (?6 IS NULL AND COALESCE((
       SELECT SUM(CASE
        WHEN type = 'income' THEN amount
        WHEN type = 'expense' THEN -amount
        WHEN type = 'saving_deposit' THEN -amount
        WHEN type = 'saving_withdrawal' THEN amount
        ELSE 0
      END)
       FROM transactions
       WHERE owner_user_id = ?2 AND deleted_at IS NULL
      ), 0) >= ?7)
    )`;
  }

  if (type === "saving_withdrawal") {
    return `${goalAccess("?4")} AND ${goalBalance} AND ${walletAccess}`;
  }

  return `${goalAccess("?4")} AND ${goalAccess("?5")} AND ${goalBalance}`;
}

async function createSavingsMutation(
  database: D1Database,
  input: CreateSavingsMutationInput,
): Promise<{ mutation: SavingsMutationDetail; replayed: boolean }> {
  const description = normalizeDescription(input.description);
  const existing = await findMutationByKey(database, input.idempotencyKey);

  if (existing) {
    return replayMutation(existing, input, description);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const result = await database
    .prepare(
      `INSERT INTO transactions (
         id, owner_user_id, type, source_savings_goal_id,
         destination_savings_goal_id, wallet_id, amount, description, transaction_date,
         source, idempotency_key, version, created_at, updated_at
       )
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ?13
       WHERE ${atomicCondition(input.type)}
       ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .bind(
      id,
      input.actorUserId,
      input.type,
      input.sourceGoalId,
      input.destinationGoalId,
      input.walletId,
      input.amount,
      description,
      input.transactionDate,
      "web",
      input.idempotencyKey,
      now,
      now,
    )
    .run();

  if (result.meta.changes !== 1) {
    const raced = await findMutationByKey(database, input.idempotencyKey);
    if (raced) {
      return replayMutation(raced, input, description);
    }

    const goalIds = [input.sourceGoalId, input.destinationGoalId].filter(
      (goalId): goalId is string => Boolean(goalId),
    );
    for (const goalId of goalIds) {
      if (!(await canMutateGoal(database, goalId, input.actorUserId))) {
        throw new NotFoundError("Pos tabungan tidak ditemukan.");
      }
    }
    if (
      input.walletId &&
      !(await canUseWallet(database, input.walletId, input.actorUserId))
    ) {
      throw new NotFoundError("Dompet tidak ditemukan.");
    }

    throw new InsufficientBalanceError(
      input.type === "saving_deposit"
        ? "Saldo tunai tidak mencukupi."
        : "Saldo pos tabungan tidak mencukupi.",
    );
  }

  const mutation = await findMutationByKey(database, input.idempotencyKey);
  if (!mutation) {
    throw new NotFoundError("Mutasi tabungan tidak ditemukan setelah dibuat.");
  }

  return { mutation: serializeMutation(mutation), replayed: false };
}

export function depositToSavings(
  database: D1Database,
  input: Omit<
    CreateSavingsMutationInput,
    "type" | "sourceGoalId" | "walletId"
  > & { walletId?: string | null },
) {
  return createSavingsMutation(database, {
    ...input,
    type: "saving_deposit",
    sourceGoalId: null,
    walletId: input.walletId ?? null,
  });
}

export function withdrawFromSavings(
  database: D1Database,
  input: Omit<
    CreateSavingsMutationInput,
    "type" | "destinationGoalId" | "walletId"
  > & { walletId?: string | null },
) {
  return createSavingsMutation(database, {
    ...input,
    type: "saving_withdrawal",
    destinationGoalId: null,
    walletId: input.walletId ?? null,
  });
}

export function transferSavings(
  database: D1Database,
  input: Omit<CreateSavingsMutationInput, "type" | "walletId">,
) {
  return createSavingsMutation(database, {
    ...input,
    type: "saving_transfer",
    walletId: null,
  });
}

export async function listSavingsHistory(
  database: D1Database,
  filters: {
    goalId?: string;
    ownerUserId?: string;
    type?: SavingsMutationType;
    dateFrom?: string;
    dateTo?: string;
    limit: number;
    offset: number;
  },
): Promise<{
  items: SavingsMutationDetail[];
  total: number;
  limit: number;
  offset: number;
}> {
  const conditions = [
    "t.deleted_at IS NULL",
    "t.type IN ('saving_deposit', 'saving_withdrawal', 'saving_transfer')",
  ];
  const parameters: Array<string | number> = [];

  const add = (condition: string, value: string) => {
    parameters.push(value);
    conditions.push(`${condition} ?${parameters.length}`);
  };

  if (filters.goalId) {
    parameters.push(filters.goalId);
    conditions.push(
      `(t.source_savings_goal_id = ?${parameters.length} OR t.destination_savings_goal_id = ?${parameters.length})`,
    );
  }
  if (filters.ownerUserId) add("t.owner_user_id =", filters.ownerUserId);
  if (filters.type) add("t.type =", filters.type);
  if (filters.dateFrom) add("t.transaction_date >=", filters.dateFrom);
  if (filters.dateTo) add("t.transaction_date <=", filters.dateTo);

  const whereSql = ` WHERE ${conditions.join(" AND ")}`;
  const count = await database
    .prepare(`SELECT COUNT(*) AS total FROM transactions t${whereSql}`)
    .bind(...parameters)
    .first<{ total: number }>();
  const { results } = await database
    .prepare(
      `${mutationSelect}${whereSql}
       ORDER BY t.transaction_date DESC, t.created_at DESC
       LIMIT ?${parameters.length + 1} OFFSET ?${parameters.length + 2}`,
    )
    .bind(...parameters, filters.limit, filters.offset)
    .all<SavingsMutationRow>();

  return {
    items: results.map(serializeMutation),
    total: count?.total ?? 0,
    limit: filters.limit,
    offset: filters.offset,
  };
}
