import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

type OwnershipRow = {
  owner_user_id: string;
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
      `SELECT owner_user_id
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
