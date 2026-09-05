import { ConflictError, InvalidCategoryError, NotFoundError } from "./errors";

type ThresholdInput = {
  percentage: number;
  notifyWeb: boolean;
  notifyTelegram: boolean;
};

type BudgetRow = {
  id: string;
  created_by_user_id: string;
  ownership_scope: "personal" | "shared";
  owner_user_id: string | null;
  category_id: string;
  category_name: string;
  monthly_limit: number;
  starts_on: string;
  is_active: number;
  spent: number;
};

function periodRange(period: string) {
  const [year, month] = period.split("-").map(Number);
  const last = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return {
    from: `${period}-01`,
    to: `${period}-${String(last).padStart(2, "0")}`,
  };
}

async function validateBudgetCategory(
  database: D1Database,
  actorUserId: string,
  scope: "personal" | "shared",
  categoryId: string,
) {
  const category = await database
    .prepare(
      `SELECT id FROM categories
       WHERE id = ?1 AND type = 'expense' AND is_active = 1
         AND ((?2 = 'shared' AND is_default = 1)
           OR (?2 = 'personal' AND (is_default = 1 OR owner_user_id = ?3)))
       LIMIT 1`,
    )
    .bind(categoryId, scope, actorUserId)
    .first<{ id: string }>();
  if (!category) throw new InvalidCategoryError("Kategori budget tidak valid.");
}

export async function createBudget(
  database: D1Database,
  input: {
    actorUserId: string;
    scope: "personal" | "shared";
    categoryId: string;
    monthlyLimit: number;
    startsOn: string;
    thresholds: ThresholdInput[];
  },
) {
  await validateBudgetCategory(
    database,
    input.actorUserId,
    input.scope,
    input.categoryId,
  );
  const id = crypto.randomUUID();
  const statements = [
    database
      .prepare(
        `INSERT INTO budgets (
           id, created_by_user_id, ownership_scope, owner_user_id,
           category_id, monthly_limit, starts_on
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.actorUserId,
        input.scope,
        input.scope === "personal" ? input.actorUserId : null,
        input.categoryId,
        input.monthlyLimit,
        input.startsOn,
      ),
    ...input.thresholds.map((threshold) =>
      database
        .prepare(
          `INSERT INTO budget_thresholds (
             id, budget_id, percentage, notify_web, notify_telegram
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          threshold.percentage,
          threshold.notifyWeb ? 1 : 0,
          threshold.notifyTelegram ? 1 : 0,
        ),
    ),
  ];

  try {
    await database.batch(statements);
  } catch {
    throw new ConflictError(
      "Budget aktif untuk kategori tersebut sudah tersedia.",
    );
  }
  return { id };
}

export async function listBudgets(
  database: D1Database,
  input: {
    period: string;
    scope?: "personal" | "shared";
    includeInactive?: boolean;
  },
) {
  const range = periodRange(input.period);
  const conditions = ["b.starts_on <= ?2"];
  const parameters: Array<string | number> = [range.from, range.to];
  if (input.scope) {
    parameters.push(input.scope);
    conditions.push(`b.ownership_scope = ?${parameters.length}`);
  }
  if (!input.includeInactive) conditions.push("b.is_active = 1");

  const { results } = await database
    .prepare(
      `SELECT b.id, b.created_by_user_id, b.ownership_scope, b.owner_user_id,
         b.category_id, c.name AS category_name, b.monthly_limit,
         b.starts_on, b.is_active,
         COALESCE(SUM(CASE WHEN t.id IS NOT NULL THEN t.amount ELSE 0 END), 0) AS spent
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       LEFT JOIN transactions t ON t.category_id = b.category_id
         AND t.type = 'expense' AND t.deleted_at IS NULL
         AND t.transaction_date BETWEEN ?1 AND ?2
         AND (b.ownership_scope = 'shared' OR t.owner_user_id = b.owner_user_id)
       WHERE ${conditions.join(" AND ")}
       GROUP BY b.id
       ORDER BY b.is_active DESC, c.name COLLATE NOCASE`,
    )
    .bind(...parameters)
    .all<BudgetRow>();

  return Promise.all(
    results.map(async (row) => {
      const thresholds = (
        await database
          .prepare(
            `SELECT id, percentage, notify_web, notify_telegram
             FROM budget_thresholds WHERE budget_id = ?1 ORDER BY percentage`,
          )
          .bind(row.id)
          .all<{
            id: string;
            percentage: number;
            notify_web: number;
            notify_telegram: number;
          }>()
      ).results;
      return {
        id: row.id,
        createdByUserId: row.created_by_user_id,
        ownershipScope: row.ownership_scope,
        ownerUserId: row.owner_user_id,
        category: { id: row.category_id, name: row.category_name },
        monthlyLimit: row.monthly_limit,
        spent: row.spent,
        remaining: row.monthly_limit - row.spent,
        percentage: Math.round((row.spent / row.monthly_limit) * 10_000) / 100,
        startsOn: row.starts_on,
        isActive: row.is_active === 1,
        thresholds: thresholds.map((item) => ({
          id: item.id,
          percentage: item.percentage,
          notifyWeb: item.notify_web === 1,
          notifyTelegram: item.notify_telegram === 1,
        })),
      };
    }),
  );
}

export async function updateBudget(
  database: D1Database,
  input: {
    budgetId: string;
    actorUserId: string;
    monthlyLimit?: number;
    isActive?: boolean;
    thresholds?: ThresholdInput[];
  },
) {
  const budget = await database
    .prepare(
      `SELECT monthly_limit, is_active FROM budgets
       WHERE id = ?1 AND ((ownership_scope = 'personal' AND owner_user_id = ?2)
         OR (ownership_scope = 'shared' AND created_by_user_id = ?2)) LIMIT 1`,
    )
    .bind(input.budgetId, input.actorUserId)
    .first<{ monthly_limit: number; is_active: number }>();
  if (!budget) throw new NotFoundError("Budget tidak ditemukan.");

  const statements = [
    database
      .prepare(
        `UPDATE budgets SET monthly_limit = ?1, is_active = ?2, updated_at = ?3
         WHERE id = ?4`,
      )
      .bind(
        input.monthlyLimit ?? budget.monthly_limit,
        input.isActive === undefined
          ? budget.is_active
          : input.isActive
            ? 1
            : 0,
        new Date().toISOString(),
        input.budgetId,
      ),
  ];
  if (input.thresholds) {
    statements.push(
      ...input.thresholds.map((threshold) =>
        database
          .prepare(
            `INSERT INTO budget_thresholds
             (id, budget_id, percentage, notify_web, notify_telegram)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(budget_id, percentage) DO UPDATE SET
               notify_web = excluded.notify_web,
               notify_telegram = excluded.notify_telegram`,
          )
          .bind(
            crypto.randomUUID(),
            input.budgetId,
            threshold.percentage,
            threshold.notifyWeb ? 1 : 0,
            threshold.notifyTelegram ? 1 : 0,
          ),
      ),
      input.thresholds.length === 0
        ? database
            .prepare(`DELETE FROM budget_thresholds WHERE budget_id = ?1`)
            .bind(input.budgetId)
        : database
            .prepare(
              `DELETE FROM budget_thresholds
               WHERE budget_id = ?1
                 AND percentage NOT IN (${input.thresholds
                   .map((_, index) => `?${index + 2}`)
                   .join(", ")})`,
            )
            .bind(
              input.budgetId,
              ...input.thresholds.map((threshold) => threshold.percentage),
            ),
    );
  }
  await database.batch(statements);
}

export async function evaluateBudgetAlerts(
  database: D1Database,
  period: string,
) {
  const budgets = await listBudgets(database, { period });
  let created = 0;
  for (const budget of budgets) {
    const recipients =
      budget.ownershipScope === "personal"
        ? [{ id: budget.ownerUserId! }]
        : (
            await database
              .prepare(`SELECT id FROM users WHERE is_active = 1`)
              .all<{ id: string }>()
          ).results;
    for (const threshold of budget.thresholds) {
      if (budget.percentage < threshold.percentage) continue;
      for (const recipient of recipients) {
        for (const channel of [
          ...(threshold.notifyWeb ? ["dashboard"] : []),
          ...(threshold.notifyTelegram ? ["telegram"] : []),
        ]) {
          const result = await database
            .prepare(
              `INSERT INTO notifications (
               id, recipient_user_id, kind, channel, budget_threshold_id,
               title, body, dedupe_key, scheduled_for
             ) VALUES (?, ?, 'budget_threshold', ?, ?, ?, ?, ?, ?)
             ON CONFLICT(dedupe_key) DO NOTHING`,
            )
            .bind(
              crypto.randomUUID(),
              recipient.id,
              channel,
              threshold.id,
              `Budget ${budget.category.name} mencapai ${threshold.percentage}%`,
              `Pemakaian Rp${budget.spent} dari Rp${budget.monthlyLimit}.`,
              `budget:${budget.id}:${period}:${threshold.percentage}:${recipient.id}:${channel}`,
              new Date().toISOString(),
            )
            .run();
          created += result.meta.changes;
        }
      }
    }
  }
  return created;
}
