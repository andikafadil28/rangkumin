import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

type OwnershipRow = {
  owner_user_id: string;
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
