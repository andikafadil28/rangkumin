import { Hono } from "hono";
import { respondWithError } from "../http/errors";
import { budgetMetadataGuard } from "../middleware/ownership";
import {
  createBudgetSchema,
  listBudgetsQuerySchema,
  updateBudgetSchema,
} from "../schemas/budget";
import { createBudget, listBudgets, updateBudget } from "../services/budgets";
import type { AppEnv } from "../types";
import { getCurrentMonthRange } from "../utils/date";

export const budgetRoutes = new Hono<AppEnv>();

budgetRoutes.get("/", async (context) => {
  try {
    const query = listBudgetsQuerySchema.parse(context.req.query());
    const period = query.period ?? getCurrentMonthRange().from.slice(0, 7);
    const budgets = await listBudgets(context.env.DB, {
      period,
      scope: query.scope,
      includeInactive: query.inactive,
    });
    return context.json({ period, budgets });
  } catch (error) {
    return respondWithError(context, error);
  }
});

budgetRoutes.post("/", async (context) => {
  try {
    const body = createBudgetSchema.parse(await context.req.json());
    const budget = await createBudget(context.env.DB, {
      actorUserId: context.get("currentUser").id,
      scope: body.ownership_scope,
      categoryId: body.category_id,
      monthlyLimit: body.monthly_limit,
      startsOn: body.starts_on,
      thresholds: body.thresholds.map((item) => ({
        percentage: item.percentage,
        notifyWeb: item.notify_web,
        notifyTelegram: item.notify_telegram,
      })),
    });
    return context.json({ budget }, 201);
  } catch (error) {
    return respondWithError(context, error);
  }
});

budgetRoutes.patch("/:budgetId", budgetMetadataGuard, async (context) => {
  try {
    const body = updateBudgetSchema.parse(await context.req.json());
    await updateBudget(context.env.DB, {
      budgetId: context.req.param("budgetId"),
      actorUserId: context.get("currentUser").id,
      monthlyLimit: body.monthly_limit,
      isActive: body.is_active,
      thresholds: body.thresholds?.map((item) => ({
        percentage: item.percentage,
        notifyWeb: item.notify_web,
        notifyTelegram: item.notify_telegram,
      })),
    });
    return context.json({ updated: true });
  } catch (error) {
    return respondWithError(context, error);
  }
});
