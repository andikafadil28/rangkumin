import { Hono, type Context } from "hono";
import { respondWithError } from "../http/errors";
import { savingsGoalMetadataGuard } from "../middleware/ownership";
import {
  archiveSavingsGoalSchema,
  createSavingsGoalSchema,
  listSavingsGoalsQuerySchema,
  savingsHistoryQuerySchema,
  savingsMutationSchema,
  savingsTransferSchema,
  updateSavingsGoalSchema,
} from "../schemas/savings";
import { idempotencyKeySchema } from "../schemas/transaction";
import {
  createSavingsGoal,
  getSavingsGoal,
  listSavingsGoals,
  setSavingsGoalArchived,
  updateSavingsGoal,
} from "../services/savings-goals";
import {
  depositToSavings,
  getCashBalances,
  listSavingsHistory,
  transferSavings,
  withdrawFromSavings,
} from "../services/savings-mutations";
import type { AppEnv } from "../types";

export const savingsRoutes = new Hono<AppEnv>();

function mutationStatus(
  context: Context<AppEnv>,
  result: { replayed: boolean },
) {
  if (result.replayed) context.header("Idempotency-Replayed", "true");
  return result.replayed ? 200 : 201;
}

savingsRoutes.get("/goals", async (context) => {
  try {
    const query = listSavingsGoalsQuerySchema.parse(context.req.query());
    const goals = await listSavingsGoals(context.env.DB, {
      scope: query.scope,
      includeArchived: query.archived,
    });
    return context.json({ goals });
  } catch (error) {
    return respondWithError(context, error);
  }
});

savingsRoutes.post("/goals", async (context) => {
  try {
    const body = createSavingsGoalSchema.parse(await context.req.json());
    const goal = await createSavingsGoal(context.env.DB, {
      actorUserId: context.get("currentUser").id,
      scope: body.ownership_scope,
      name: body.name,
      targetAmount: body.target_amount ?? null,
    });
    return context.json({ goal }, 201);
  } catch (error) {
    return respondWithError(context, error);
  }
});

savingsRoutes.get("/goals/:goalId", async (context) => {
  const goalId = context.req.param("goalId").trim();
  if (!goalId || goalId.length > 128) {
    return context.json(
      { error: "Not Found", message: "Pos tabungan tidak ditemukan." },
      404,
    );
  }

  const goal = await getSavingsGoal(context.env.DB, goalId);
  return goal
    ? context.json({ goal })
    : context.json(
        { error: "Not Found", message: "Pos tabungan tidak ditemukan." },
        404,
      );
});

savingsRoutes.patch(
  "/goals/:goalId",
  savingsGoalMetadataGuard,
  async (context) => {
    try {
      const body = updateSavingsGoalSchema.parse(await context.req.json());
      const goal = await updateSavingsGoal(context.env.DB, {
        goalId: context.req.param("goalId"),
        actorUserId: context.get("currentUser").id,
        name: body.name,
        targetAmount: body.target_amount,
      });
      return context.json({ goal });
    } catch (error) {
      return respondWithError(context, error);
    }
  },
);

savingsRoutes.patch(
  "/goals/:goalId/archive",
  savingsGoalMetadataGuard,
  async (context) => {
    try {
      const body = archiveSavingsGoalSchema.parse(await context.req.json());
      const goal = await setSavingsGoalArchived(context.env.DB, {
        goalId: context.req.param("goalId"),
        actorUserId: context.get("currentUser").id,
        archived: body.archived,
      });
      return context.json({ goal });
    } catch (error) {
      return respondWithError(context, error);
    }
  },
);

savingsRoutes.post("/goals/:goalId/deposits", async (context) => {
  try {
    const body = savingsMutationSchema.parse(await context.req.json());
    const idempotencyKey = idempotencyKeySchema.parse(
      context.req.header("Idempotency-Key"),
    );
    const result = await depositToSavings(context.env.DB, {
      actorUserId: context.get("currentUser").id,
      destinationGoalId: context.req.param("goalId"),
      amount: body.amount,
      description: body.description ?? null,
      transactionDate: body.transaction_date,
      idempotencyKey,
    });
    const status = mutationStatus(context, result);
    return context.json({ mutation: result.mutation }, status);
  } catch (error) {
    return respondWithError(context, error);
  }
});

savingsRoutes.post("/goals/:goalId/withdrawals", async (context) => {
  try {
    const body = savingsMutationSchema.parse(await context.req.json());
    const idempotencyKey = idempotencyKeySchema.parse(
      context.req.header("Idempotency-Key"),
    );
    const result = await withdrawFromSavings(context.env.DB, {
      actorUserId: context.get("currentUser").id,
      sourceGoalId: context.req.param("goalId"),
      amount: body.amount,
      description: body.description ?? null,
      transactionDate: body.transaction_date,
      idempotencyKey,
    });
    const status = mutationStatus(context, result);
    return context.json({ mutation: result.mutation }, status);
  } catch (error) {
    return respondWithError(context, error);
  }
});

savingsRoutes.post("/transfers", async (context) => {
  try {
    const body = savingsTransferSchema.parse(await context.req.json());
    const idempotencyKey = idempotencyKeySchema.parse(
      context.req.header("Idempotency-Key"),
    );
    const result = await transferSavings(context.env.DB, {
      actorUserId: context.get("currentUser").id,
      sourceGoalId: body.source_goal_id,
      destinationGoalId: body.destination_goal_id,
      amount: body.amount,
      description: body.description ?? null,
      transactionDate: body.transaction_date,
      idempotencyKey,
    });
    const status = mutationStatus(context, result);
    return context.json({ mutation: result.mutation }, status);
  } catch (error) {
    return respondWithError(context, error);
  }
});

savingsRoutes.get("/history", async (context) => {
  try {
    const query = savingsHistoryQuerySchema.parse(context.req.query());
    const history = await listSavingsHistory(context.env.DB, {
      goalId: query.goal,
      ownerUserId: query.owner,
      type: query.type,
      dateFrom: query.from,
      dateTo: query.to,
      limit: query.limit,
      offset: query.offset,
    });
    return context.json(history);
  } catch (error) {
    return respondWithError(context, error);
  }
});

savingsRoutes.get("/overview", async (context) => {
  const cashBalances = await getCashBalances(context.env.DB);
  const goals = await listSavingsGoals(context.env.DB, {
    includeArchived: true,
  });

  return context.json({ cashBalances, goals });
});
