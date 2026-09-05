import { Hono } from "hono";
import { identityMiddleware } from "./middleware/identity";
import { budgetRoutes } from "./routes/budgets";
import { categoryRoutes } from "./routes/categories";
import { notificationRoutes } from "./routes/notifications";
import { reminderRoutes } from "./routes/reminders";
import { savingsRoutes } from "./routes/savings";
import {
  transactionQueryRoutes,
  transactionRoutes,
} from "./routes/transactions";
import { evaluateBudgetAlerts } from "./services/budgets";
import {
  processDueReminders,
  processSnoozedOccurrences,
} from "./services/reminders";
import { purgeExpiredTransactions } from "./services/trash";
import type { AppEnv } from "./types";
import { getCurrentMonthRange } from "./utils/date";

export const app = new Hono<AppEnv>();

app.get("/api/health", (context) => {
  return context.json({
    status: "ok",
    service: "rangkumin",
    environment: context.env.APP_ENV,
    timestamp: new Date().toISOString(),
  });
});

const protectedApi = new Hono<AppEnv>();

protectedApi.use("*", identityMiddleware);
protectedApi.get("/me", (context) => {
  return context.json({ user: context.get("currentUser") });
});
protectedApi.route("/budgets", budgetRoutes);
protectedApi.route("/categories", categoryRoutes);
protectedApi.route("/notifications", notificationRoutes);
protectedApi.route("/reminders", reminderRoutes);
protectedApi.route("/savings", savingsRoutes);
protectedApi.route("/transactions", transactionRoutes);
protectedApi.route("/", transactionQueryRoutes);

app.route("/api", protectedApi);

app.notFound((context) => {
  return context.json(
    {
      error: "Not Found",
      message: "Endpoint API tidak ditemukan.",
    },
    404,
  );
});

app.onError((error, context) => {
  console.error("Unhandled worker error", error);

  return context.json(
    {
      error: "Internal Server Error",
      message: "Terjadi kesalahan pada layanan Rangkumin.",
    },
    500,
  );
});

export default {
  fetch: app.fetch,
  scheduled(controller, environment, executionContext) {
    const jobs: Promise<unknown>[] = [];
    if (controller.cron === "15 17 * * *") {
      jobs.push(purgeExpiredTransactions(environment.DB));
    }
    const period = getCurrentMonthRange().from.slice(0, 7);
    jobs.push(
      processDueReminders(environment.DB),
      processSnoozedOccurrences(environment.DB),
      evaluateBudgetAlerts(environment.DB, period),
    );
    executionContext.waitUntil(Promise.all(jobs));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
