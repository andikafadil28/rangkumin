import { Hono } from "hono";
import { respondWithError } from "../http/errors";
import { transactionOwnershipGuard } from "../middleware/ownership";
import {
  createTransactionSchema,
  idempotencyKeySchema,
  listTransactionsQuerySchema,
  summaryQuerySchema,
  updateTransactionSchema,
} from "../schemas/transaction";
import {
  createTransaction,
  getTransaction,
  listTransactions,
  notifyTransactionCreated,
  purgeTransaction,
  restoreTransaction,
  softDeleteTransaction,
  summarizeTransactions,
  updateTransaction,
} from "../services/transactions";
import { deliverWebPushNotifications } from "../services/web-push";
import type { AppEnv } from "../types";
import { getCurrentMonthRange } from "../utils/date";

export const transactionRoutes = new Hono<AppEnv>();

transactionRoutes.get("/", async (context) => {
  try {
    const query = listTransactionsQuerySchema.parse(context.req.query());
    const result = await listTransactions(context.env.DB, {
      ownerUserId: query.owner,
      type: query.type,
      categoryId: query.category,
      dateFrom: query.from,
      dateTo: query.to,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });

    return context.json(result);
  } catch (error) {
    return respondWithError(context, error);
  }
});

transactionRoutes.post("/", async (context) => {
  try {
    const body = createTransactionSchema.parse(await context.req.json());
    const idempotencyKey = idempotencyKeySchema.parse(
      context.req.header("Idempotency-Key"),
    );
    const currentUser = context.get("currentUser");
    const expectedActorId = context.req.header("X-Rangkumin-Actor-Id");
    if (expectedActorId && expectedActorId !== currentUser.id) {
      return context.json(
        {
          error: "Actor Mismatch",
          message: "Akun aktif tidak sesuai dengan pemilik transaksi offline.",
        },
        409,
      );
    }
    const result = await createTransaction(context.env.DB, {
      ownerUserId: currentUser.id,
      type: body.type,
      amount: body.amount,
      transactionDate: body.transaction_date,
      categoryId: body.category_id,
      description: body.description ?? null,
      source: "web",
      idempotencyKey,
    });

    if (result.replayed) {
      context.header("Idempotency-Replayed", "true");
    } else {
      try {
        await notifyTransactionCreated(
          context.env.DB,
          result.transaction,
          currentUser.displayName,
        );
      } catch (error) {
        console.error("Gagal membuat notifikasi transaksi", error);
      }

      try {
        const vapid = {
          subject:
            context.env.WEB_PUSH_VAPID_SUBJECT ??
            "https://rangkumin.dikadevit.my.id",
          publicKey: context.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "",
          privateKey: context.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "",
        };
        if (vapid.publicKey && vapid.privateKey) {
          context.executionCtx.waitUntil(
            deliverWebPushNotifications(context.env.DB, vapid),
          );
        }
      } catch {
        // executionCtx tidak tersedia (misalnya saat load testing lokal).
      }
    }

    return context.json(
      { transaction: result.transaction },
      result.replayed ? 200 : 201,
    );
  } catch (error) {
    return respondWithError(context, error);
  }
});

transactionRoutes.get("/:transactionId", async (context) => {
  const transactionId = context.req.param("transactionId").trim();
  if (!transactionId || transactionId.length > 128) {
    return context.json(
      { error: "Not Found", message: "Transaksi tidak ditemukan." },
      404,
    );
  }

  const transaction = await getTransaction(context.env.DB, transactionId);
  return transaction
    ? context.json({ transaction })
    : context.json(
        { error: "Not Found", message: "Transaksi tidak ditemukan." },
        404,
      );
});

transactionRoutes.patch(
  "/:transactionId",
  transactionOwnershipGuard,
  async (context) => {
    try {
      const body = updateTransactionSchema.parse(await context.req.json());
      const transaction = await updateTransaction(context.env.DB, {
        id: context.req.param("transactionId"),
        ownerUserId: context.get("currentUser").id,
        version: body.version,
        patch: {
          type: body.type,
          amount: body.amount,
          transactionDate: body.transaction_date,
          categoryId: body.category_id,
          description: body.description,
        },
      });

      return context.json({ transaction });
    } catch (error) {
      return respondWithError(context, error);
    }
  },
);

transactionRoutes.delete(
  "/:transactionId",
  transactionOwnershipGuard,
  async (context) => {
    try {
      await softDeleteTransaction(
        context.env.DB,
        context.req.param("transactionId"),
      );
      return context.body(null, 204);
    } catch (error) {
      return respondWithError(context, error);
    }
  },
);

transactionRoutes.post(
  "/:transactionId/restore",
  transactionOwnershipGuard,
  async (context) => {
    try {
      const transaction = await restoreTransaction(
        context.env.DB,
        context.req.param("transactionId"),
      );
      return context.json({ transaction });
    } catch (error) {
      return respondWithError(context, error);
    }
  },
);

transactionRoutes.delete(
  "/:transactionId/purge",
  transactionOwnershipGuard,
  async (context) => {
    try {
      await purgeTransaction(
        context.env.DB,
        context.req.param("transactionId"),
      );
      return context.body(null, 204);
    } catch (error) {
      return respondWithError(context, error);
    }
  },
);

export const transactionQueryRoutes = new Hono<AppEnv>();

transactionQueryRoutes.get("/trash", async (context) => {
  try {
    const query = listTransactionsQuerySchema.parse(context.req.query());
    const result = await listTransactions(context.env.DB, {
      ownerUserId: query.owner,
      type: query.type,
      categoryId: query.category,
      dateFrom: query.from,
      dateTo: query.to,
      status: "trashed",
      limit: query.limit,
      offset: query.offset,
    });

    return context.json(result);
  } catch (error) {
    return respondWithError(context, error);
  }
});

transactionQueryRoutes.get("/summary", async (context) => {
  try {
    const query = summaryQuerySchema.parse(context.req.query());
    const defaultPeriod = getCurrentMonthRange();
    const dateFrom = query.from ?? (query.to ? undefined : defaultPeriod.from);
    const dateTo = query.to ?? (query.from ? undefined : defaultPeriod.to);
    const summary = await summarizeTransactions(context.env.DB, {
      ownerUserId: query.owner,
      dateFrom,
      dateTo,
    });

    return context.json({ period: { from: dateFrom, to: dateTo }, ...summary });
  } catch (error) {
    return respondWithError(context, error);
  }
});
