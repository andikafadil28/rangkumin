import { Hono } from "hono";
import { respondWithError } from "../http/errors";
import { idempotencyKeySchema } from "../schemas/transaction";
import {
  createWalletSchema,
  listWalletsQuerySchema,
  updateWalletSchema,
  walletTransferSchema,
} from "../schemas/wallet";
import {
  archiveWallet,
  createWallet,
  deleteWallet,
  getWallet,
  listWallets,
  setDefaultWallet,
  transferBetweenWallets,
  unarchiveWallet,
  updateWallet,
} from "../services/wallets";
import type { AppEnv } from "../types";

export const walletRoutes = new Hono<AppEnv>();

function validWalletId(value: string): string | null {
  const walletId = value.trim();
  return walletId && walletId.length <= 128 ? walletId : null;
}

walletRoutes.get("/", async (context) => {
  try {
    const query = listWalletsQuerySchema.parse(context.req.query());
    const wallets = await listWallets(context.env.DB, {
      ownerUserId: query.owner,
      includeArchived: query.archived,
    });
    return context.json({ wallets });
  } catch (error) {
    return respondWithError(context, error);
  }
});

walletRoutes.post("/", async (context) => {
  try {
    const body = createWalletSchema.parse(await context.req.json());
    const wallet = await createWallet(context.env.DB, {
      ownerUserId: context.get("currentUser").id,
      type: body.type,
      name: body.name,
      description: body.description,
      icon: body.icon,
      color: body.color,
      groupName: body.group_name,
      initialBalance: body.initial_balance,
      defaultWallet: body.default_wallet,
      sortOrder: body.sort_order,
    });
    return context.json({ wallet }, 201);
  } catch (error) {
    return respondWithError(context, error);
  }
});

walletRoutes.post("/transfer", async (context) => {
  try {
    const body = walletTransferSchema.parse(await context.req.json());
    const idempotencyKey = idempotencyKeySchema.parse(
      context.req.header("Idempotency-Key"),
    );
    const result = await transferBetweenWallets(context.env.DB, {
      actorUserId: context.get("currentUser").id,
      sourceWalletId: body.source_wallet_id,
      destinationWalletId: body.destination_wallet_id,
      amount: body.amount,
      description: body.description ?? null,
      transactionDate: body.transaction_date,
      idempotencyKey,
    });
    if (result.replayed) context.header("Idempotency-Replayed", "true");
    return context.json(
      { transfer: result.transfer },
      result.replayed ? 200 : 201,
    );
  } catch (error) {
    return respondWithError(context, error);
  }
});

walletRoutes.get("/:walletId", async (context) => {
  const walletId = validWalletId(context.req.param("walletId"));
  if (!walletId) {
    return context.json(
      { error: "Not Found", message: "Dompet tidak ditemukan." },
      404,
    );
  }

  const wallet = await getWallet(context.env.DB, walletId);
  return wallet
    ? context.json({ wallet })
    : context.json(
        { error: "Not Found", message: "Dompet tidak ditemukan." },
        404,
      );
});

walletRoutes.patch("/:walletId", async (context) => {
  try {
    const walletId = validWalletId(context.req.param("walletId"));
    if (!walletId) {
      return context.json(
        { error: "Not Found", message: "Dompet tidak ditemukan." },
        404,
      );
    }
    const body = updateWalletSchema.parse(await context.req.json());
    const wallet = await updateWallet(context.env.DB, {
      walletId,
      ownerUserId: context.get("currentUser").id,
      type: body.type,
      name: body.name,
      description: body.description,
      icon: body.icon,
      color: body.color,
      groupName: body.group_name,
      sortOrder: body.sort_order,
    });
    return context.json({ wallet });
  } catch (error) {
    return respondWithError(context, error);
  }
});

walletRoutes.patch("/:walletId/default", async (context) => {
  try {
    const walletId = validWalletId(context.req.param("walletId"));
    if (!walletId) {
      return context.json(
        { error: "Not Found", message: "Dompet tidak ditemukan." },
        404,
      );
    }
    const wallet = await setDefaultWallet(context.env.DB, {
      walletId,
      ownerUserId: context.get("currentUser").id,
    });
    return context.json({ wallet });
  } catch (error) {
    return respondWithError(context, error);
  }
});

walletRoutes.patch("/:walletId/archive", async (context) => {
  try {
    const walletId = validWalletId(context.req.param("walletId"));
    if (!walletId) {
      return context.json(
        { error: "Not Found", message: "Dompet tidak ditemukan." },
        404,
      );
    }
    const wallet = await archiveWallet(context.env.DB, {
      walletId,
      ownerUserId: context.get("currentUser").id,
    });
    return context.json({ wallet });
  } catch (error) {
    return respondWithError(context, error);
  }
});

walletRoutes.patch("/:walletId/unarchive", async (context) => {
  try {
    const walletId = validWalletId(context.req.param("walletId"));
    if (!walletId) {
      return context.json(
        { error: "Not Found", message: "Dompet tidak ditemukan." },
        404,
      );
    }
    const wallet = await unarchiveWallet(context.env.DB, {
      walletId,
      ownerUserId: context.get("currentUser").id,
    });
    return context.json({ wallet });
  } catch (error) {
    return respondWithError(context, error);
  }
});

walletRoutes.delete("/:walletId", async (context) => {
  try {
    const walletId = validWalletId(context.req.param("walletId"));
    if (!walletId) {
      return context.json(
        { error: "Not Found", message: "Dompet tidak ditemukan." },
        404,
      );
    }
    await deleteWallet(context.env.DB, {
      walletId,
      ownerUserId: context.get("currentUser").id,
    });
    return context.body(null, 204);
  } catch (error) {
    return respondWithError(context, error);
  }
});
