import { NotFoundError, SavingsGoalConflictError } from "./errors";
import { normalizeCategoryName } from "./categories";

export type SavingsGoalRow = {
  id: string;
  created_by_user_id: string;
  ownership_scope: "personal" | "shared";
  owner_user_id: string | null;
  name: string;
  target_amount: number | null;
  balance: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SavingsGoalDetail = {
  id: string;
  createdByUserId: string;
  ownershipScope: "personal" | "shared";
  ownerUserId: string | null;
  name: string;
  targetAmount: number | null;
  balance: number;
  progressPercentage: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const savingsGoalSelect = `SELECT
  sg.id, sg.created_by_user_id, sg.ownership_scope, sg.owner_user_id,
  sg.name, sg.target_amount, sg.archived_at, sg.created_at, sg.updated_at,
  COALESCE(SUM(CASE
    WHEN t.type IN ('saving_deposit', 'saving_transfer')
      AND t.destination_savings_goal_id = sg.id THEN t.amount
    WHEN t.type IN ('saving_withdrawal', 'saving_transfer')
      AND t.source_savings_goal_id = sg.id THEN -t.amount
    ELSE 0
  END), 0) AS balance
FROM savings_goals sg
LEFT JOIN transactions t
  ON t.deleted_at IS NULL
  AND (
    t.source_savings_goal_id = sg.id
    OR t.destination_savings_goal_id = sg.id
  )`;

export function serializeSavingsGoal(row: SavingsGoalRow): SavingsGoalDetail {
  return {
    id: row.id,
    createdByUserId: row.created_by_user_id,
    ownershipScope: row.ownership_scope,
    ownerUserId: row.owner_user_id,
    name: row.name,
    targetAmount: row.target_amount,
    balance: row.balance,
    progressPercentage: row.target_amount
      ? Math.round((row.balance / row.target_amount) * 10_000) / 100
      : null,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getSavingsGoal(
  database: D1Database,
  goalId: string,
): Promise<SavingsGoalDetail | null> {
  const row = await database
    .prepare(`${savingsGoalSelect} WHERE sg.id = ?1 GROUP BY sg.id LIMIT 1`)
    .bind(goalId)
    .first<SavingsGoalRow>();

  return row ? serializeSavingsGoal(row) : null;
}

export async function listSavingsGoals(
  database: D1Database,
  filters: { scope?: "personal" | "shared"; includeArchived?: boolean },
): Promise<SavingsGoalDetail[]> {
  const conditions: string[] = [];
  const parameters: Array<string | number> = [];

  if (filters.scope) {
    conditions.push("sg.ownership_scope = ?1");
    parameters.push(filters.scope);
  }
  if (!filters.includeArchived) {
    conditions.push("sg.archived_at IS NULL");
  }

  const whereSql = conditions.length
    ? ` WHERE ${conditions.join(" AND ")}`
    : "";
  const { results } = await database
    .prepare(
      `${savingsGoalSelect}${whereSql}
       GROUP BY sg.id
       ORDER BY sg.archived_at IS NOT NULL, sg.created_at DESC`,
    )
    .bind(...parameters)
    .all<SavingsGoalRow>();

  return results.map(serializeSavingsGoal);
}

async function goalNameExists(
  database: D1Database,
  input: {
    scope: "personal" | "shared";
    ownerUserId: string;
    normalizedName: string;
    exceptId?: string;
  },
): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT id
       FROM savings_goals
       WHERE ownership_scope = ?1
         AND normalized_name = ?2
         AND archived_at IS NULL
         AND (?3 = 'shared' OR owner_user_id = ?4)
         AND (?5 IS NULL OR id <> ?5)
       LIMIT 1`,
    )
    .bind(
      input.scope,
      input.normalizedName,
      input.scope,
      input.ownerUserId,
      input.exceptId ?? null,
    )
    .first<{ id: string }>();

  return Boolean(row);
}

export async function createSavingsGoal(
  database: D1Database,
  input: {
    actorUserId: string;
    scope: "personal" | "shared";
    name: string;
    targetAmount: number | null;
  },
): Promise<SavingsGoalDetail> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeCategoryName(name);

  if (
    await goalNameExists(database, {
      scope: input.scope,
      ownerUserId: input.actorUserId,
      normalizedName,
    })
  ) {
    throw new SavingsGoalConflictError("Nama pos tabungan sudah digunakan.");
  }

  const id = crypto.randomUUID();
  const result = await database
    .prepare(
      `INSERT INTO savings_goals (
         id, created_by_user_id, ownership_scope, owner_user_id,
         name, normalized_name, target_amount
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
    )
    .bind(
      id,
      input.actorUserId,
      input.scope,
      input.scope === "personal" ? input.actorUserId : null,
      name,
      normalizedName,
      input.targetAmount,
    )
    .run();

  if (result.meta.changes !== 1) {
    throw new SavingsGoalConflictError("Nama pos tabungan sudah digunakan.");
  }

  const goal = await getSavingsGoal(database, id);
  if (!goal) {
    throw new NotFoundError("Pos tabungan tidak ditemukan setelah dibuat.");
  }

  return goal;
}

export async function updateSavingsGoal(
  database: D1Database,
  input: {
    goalId: string;
    actorUserId: string;
    name?: string;
    targetAmount?: number | null;
  },
): Promise<SavingsGoalDetail> {
  const current = await getSavingsGoal(database, input.goalId);
  if (!current) {
    throw new NotFoundError("Pos tabungan tidak ditemukan.");
  }

  const name = input.name?.trim().replace(/\s+/g, " ") ?? current.name;
  const normalizedName = normalizeCategoryName(name);

  if (
    normalizedName !== normalizeCategoryName(current.name) &&
    (await goalNameExists(database, {
      scope: current.ownershipScope,
      ownerUserId: current.ownerUserId ?? input.actorUserId,
      normalizedName,
      exceptId: current.id,
    }))
  ) {
    throw new SavingsGoalConflictError("Nama pos tabungan sudah digunakan.");
  }

  const { results } = await database
    .prepare(
      `UPDATE savings_goals
       SET name = ?1,
           normalized_name = ?2,
           target_amount = ?3,
           updated_at = ?4
       WHERE id = ?5
         AND (
           (ownership_scope = 'personal' AND owner_user_id = ?6)
           OR (ownership_scope = 'shared' AND created_by_user_id = ?6)
         )
       RETURNING id`,
    )
    .bind(
      name,
      normalizedName,
      input.targetAmount === undefined
        ? current.targetAmount
        : input.targetAmount,
      new Date().toISOString(),
      input.goalId,
      input.actorUserId,
    )
    .all<{ id: string }>();

  if (!results[0]) {
    throw new NotFoundError("Pos tabungan tidak ditemukan.");
  }

  const updated = await getSavingsGoal(database, input.goalId);
  if (!updated) {
    throw new NotFoundError("Pos tabungan tidak ditemukan.");
  }

  return updated;
}

export async function setSavingsGoalArchived(
  database: D1Database,
  input: { goalId: string; actorUserId: string; archived: boolean },
): Promise<SavingsGoalDetail> {
  const current = await getSavingsGoal(database, input.goalId);
  if (!current) {
    throw new NotFoundError("Pos tabungan tidak ditemukan.");
  }

  if (
    !input.archived &&
    (await goalNameExists(database, {
      scope: current.ownershipScope,
      ownerUserId: current.ownerUserId ?? input.actorUserId,
      normalizedName: normalizeCategoryName(current.name),
      exceptId: current.id,
    }))
  ) {
    throw new SavingsGoalConflictError("Nama pos tabungan sudah digunakan.");
  }

  const result = await database
    .prepare(
      `UPDATE savings_goals
       SET archived_at = ?1, updated_at = ?2
       WHERE id = ?3
         AND (
           (ownership_scope = 'personal' AND owner_user_id = ?4)
           OR (ownership_scope = 'shared' AND created_by_user_id = ?4)
         )`,
    )
    .bind(
      input.archived ? new Date().toISOString() : null,
      new Date().toISOString(),
      input.goalId,
      input.actorUserId,
    )
    .run();

  if (result.meta.changes !== 1) {
    throw new NotFoundError("Pos tabungan tidak ditemukan.");
  }

  const updated = await getSavingsGoal(database, input.goalId);
  if (!updated) {
    throw new NotFoundError("Pos tabungan tidak ditemukan.");
  }

  return updated;
}
