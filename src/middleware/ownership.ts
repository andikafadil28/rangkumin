import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

type OwnershipRow = {
  owner_user_id: string;
  type?: string;
};

type CategoryOwnershipRow = {
  owner_user_id: string | null;
  is_default: number;
};

export const transactionOwnershipGuard = createMiddleware<AppEnv>(
  async (context, next) => {
    const transactionId = context.req.param("transactionId")?.trim();

    if (!transactionId || transactionId.length > 128) {
      return context.json(
        {
          error: "Not Found",
          message: "Transaksi tidak ditemukan.",
        },
        404,
      );
    }

    const transaction = await context.env.DB.prepare(
      `SELECT owner_user_id, type
       FROM transactions
       WHERE id = ?1
       LIMIT 1`,
    )
      .bind(transactionId)
      .first<OwnershipRow>();

    if (!transaction) {
      return context.json(
        {
          error: "Not Found",
          message: "Transaksi tidak ditemukan.",
        },
        404,
      );
    }

    if (transaction.owner_user_id !== context.get("currentUser").id) {
      return context.json(
        {
          error: "Forbidden",
          message: "Transaksi hanya dapat diubah oleh pemiliknya.",
        },
        403,
      );
    }

    if (transaction.type?.startsWith("saving_")) {
      return context.json(
        {
          error: "Conflict",
          message: "Riwayat mutasi tabungan bersifat immutable.",
        },
        409,
      );
    }

    await next();
  },
);

type SavingsGoalOwnershipRow = {
  created_by_user_id: string;
  ownership_scope: "personal" | "shared";
  owner_user_id: string | null;
};

export const savingsGoalMetadataGuard = createMiddleware<AppEnv>(
  async (context, next) => {
    const goalId = context.req.param("goalId")?.trim();
    if (!goalId || goalId.length > 128) {
      return context.json(
        { error: "Not Found", message: "Pos tabungan tidak ditemukan." },
        404,
      );
    }

    const goal = await context.env.DB.prepare(
      `SELECT created_by_user_id, ownership_scope, owner_user_id
       FROM savings_goals
       WHERE id = ?1
       LIMIT 1`,
    )
      .bind(goalId)
      .first<SavingsGoalOwnershipRow>();

    if (!goal) {
      return context.json(
        { error: "Not Found", message: "Pos tabungan tidak ditemukan." },
        404,
      );
    }

    const userId = context.get("currentUser").id;
    const allowed =
      goal.ownership_scope === "personal"
        ? goal.owner_user_id === userId
        : goal.created_by_user_id === userId;

    if (!allowed) {
      return context.json(
        {
          error: "Forbidden",
          message: "Metadata pos tabungan hanya dapat diubah pemiliknya.",
        },
        403,
      );
    }

    await next();
  },
);

export const budgetMetadataGuard = createMiddleware<AppEnv>(
  async (context, next) => {
    const budgetId = context.req.param("budgetId")?.trim();
    if (!budgetId || budgetId.length > 128) {
      return context.json(
        { error: "Not Found", message: "Budget tidak ditemukan." },
        404,
      );
    }
    const budget = await context.env.DB.prepare(
      `SELECT created_by_user_id, ownership_scope, owner_user_id
       FROM budgets WHERE id = ?1 LIMIT 1`,
    )
      .bind(budgetId)
      .first<{
        created_by_user_id: string;
        ownership_scope: "personal" | "shared";
        owner_user_id: string | null;
      }>();
    if (!budget) {
      return context.json(
        { error: "Not Found", message: "Budget tidak ditemukan." },
        404,
      );
    }
    const userId = context.get("currentUser").id;
    const allowed =
      budget.ownership_scope === "personal"
        ? budget.owner_user_id === userId
        : budget.created_by_user_id === userId;
    if (!allowed) {
      return context.json(
        {
          error: "Forbidden",
          message: "Budget hanya dapat diubah pembuatnya.",
        },
        403,
      );
    }
    await next();
  },
);

export const reminderCreatorGuard = createMiddleware<AppEnv>(
  async (context, next) => {
    const reminderId = context.req.param("reminderId")?.trim();
    if (!reminderId || reminderId.length > 128) {
      return context.json(
        { error: "Not Found", message: "Reminder tidak ditemukan." },
        404,
      );
    }
    const reminder = await context.env.DB.prepare(
      `SELECT creator_user_id FROM reminders WHERE id = ?1 LIMIT 1`,
    )
      .bind(reminderId)
      .first<{ creator_user_id: string }>();
    if (!reminder) {
      return context.json(
        { error: "Not Found", message: "Reminder tidak ditemukan." },
        404,
      );
    }
    if (reminder.creator_user_id !== context.get("currentUser").id) {
      return context.json(
        {
          error: "Forbidden",
          message: "Reminder hanya dapat diubah pembuatnya.",
        },
        403,
      );
    }
    await next();
  },
);

export const categoryOwnershipGuard = createMiddleware<AppEnv>(
  async (context, next) => {
    const categoryId = context.req.param("categoryId")?.trim();

    if (!categoryId || categoryId.length > 128) {
      return context.json(
        { error: "Not Found", message: "Kategori tidak ditemukan." },
        404,
      );
    }

    const category = await context.env.DB.prepare(
      `SELECT owner_user_id, is_default
       FROM categories
       WHERE id = ?1
       LIMIT 1`,
    )
      .bind(categoryId)
      .first<CategoryOwnershipRow>();

    if (!category) {
      return context.json(
        { error: "Not Found", message: "Kategori tidak ditemukan." },
        404,
      );
    }

    if (
      category.is_default === 1 ||
      category.owner_user_id !== context.get("currentUser").id
    ) {
      return context.json(
        {
          error: "Forbidden",
          message: "Kategori hanya dapat diubah oleh pembuatnya.",
        },
        403,
      );
    }

    await next();
  },
);
