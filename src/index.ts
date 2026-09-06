import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { identityMiddleware } from "./middleware/identity";
import { budgetRoutes } from "./routes/budgets";
import { categoryRoutes } from "./routes/categories";
import { notificationRoutes } from "./routes/notifications";
import { importExportRoutes } from "./routes/import-export";
import { receiptScanRoutes } from "./routes/receipt-scans";
import { reminderRoutes } from "./routes/reminders";
import { savingsRoutes } from "./routes/savings";
import {
  transactionQueryRoutes,
  transactionRoutes,
} from "./routes/transactions";
import { webPushRoutes } from "./routes/web-push";
import { evaluateBudgetAlerts } from "./services/budgets";
import {
  processDueReminders,
  processSnoozedOccurrences,
} from "./services/reminders";
import { purgeExpiredTransactions } from "./services/trash";
import { deliverWebPushNotifications } from "./services/web-push";
import type { AppBindings, AppEnv } from "./types";
import { getCurrentMonthRange } from "./utils/date";

export const app = new Hono<AppEnv>();

const disableApiCaching: MiddlewareHandler<AppEnv> = async (context, next) => {
  await next();
  context.header("Cache-Control", "private, no-store, max-age=0");
  context.header("CDN-Cache-Control", "no-store");
};

app.use("/api", disableApiCaching);
app.use("/api/*", disableApiCaching);

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
protectedApi.route("/", importExportRoutes);
protectedApi.route("/push", webPushRoutes);
protectedApi.route("/receipt-scans", receiptScanRoutes);
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
    executionContext.waitUntil(
      (async () => {
        const period = getCurrentMonthRange().from.slice(0, 7);
        await Promise.allSettled([
          processDueReminders(environment.DB),
          processSnoozedOccurrences(environment.DB),
          evaluateBudgetAlerts(environment.DB, period),
          ...(controller.cron === "15 17 * * *"
            ? [purgeExpiredTransactions(environment.DB)]
            : []),
        ]);

        const vapid = {
          subject:
            environment.WEB_PUSH_VAPID_SUBJECT ??
            "https://rangkumin.dikadevit.my.id",
          publicKey: environment.WEB_PUSH_VAPID_PUBLIC_KEY ?? "",
          privateKey: environment.WEB_PUSH_VAPID_PRIVATE_KEY ?? "",
        };
        if (vapid.publicKey && vapid.privateKey) {
          await deliverWebPushNotifications(environment.DB, vapid);
        }
      })(),
    );
  },
} satisfies ExportedHandler<AppBindings>;
